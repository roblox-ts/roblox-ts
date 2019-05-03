import * as ts from "ts-morph";
import {
	checkMethodReserved,
	checkReserved,
	compileAccessorDeclaration,
	compileConstructorDeclaration,
	compileExpression,
	compileMethodDeclaration,
	compileRoactClassDeclaration,
	inheritsFromRoact,
	ROACT_COMPONENT_TYPE,
	ROACT_DERIVED_CLASSES_ERROR,
	ROACT_PURE_COMPONENT_TYPE,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { shouldHoist } from "../typeUtilities";
import { bold } from "../utility";

const LUA_RESERVED_METAMETHODS = [
	"__index",
	"__newindex",
	"__add",
	"__sub",
	"__mul",
	"__div",
	"__mod",
	"__pow",
	"__unm",
	"__eq",
	"__lt",
	"__le",
	"__call",
	"__concat",
	"__tostring",
	"__len",
	"__metatable",
	"__mode",
];

const LUA_UNDEFINABLE_METAMETHODS = ["__index", "__newindex", "__mode"];

function getClassMethod(
	classDec: ts.ClassDeclaration | ts.ClassExpression,
	methodName: string,
): ts.MethodDeclaration | undefined {
	const method = classDec.getMethod(methodName);
	if (method) {
		return method;
	}
	const baseClass = classDec.getBaseClass();
	if (baseClass) {
		const baseMethod = getClassMethod(baseClass, methodName);
		if (baseMethod) {
			return baseMethod;
		}
	}
	return undefined;
}

// TODO: remove
function getConstructor(node: ts.ClassDeclaration | ts.ClassExpression) {
	for (const constructor of node.getConstructors()) {
		return constructor;
	}
}

function compileClass(state: CompilerState, node: ts.ClassDeclaration | ts.ClassExpression) {
	const name = node.getName() || state.getNewId();
	const nameNode = node.getNameNode();
	let expAlias: string | undefined;

	if (nameNode) {
		checkReserved(name, nameNode, true);
	}

	if (ts.TypeGuards.isClassDeclaration(node)) {
		state.pushExport(name, node);
	}

	// Roact checks
	const baseTypes = node.getBaseTypes();
	for (const baseType of baseTypes) {
		const baseTypeText = baseType.getText();

		// Handle the special case where we have a roact class
		if (baseTypeText.startsWith(ROACT_COMPONENT_TYPE)) {
			return compileRoactClassDeclaration(state, "Component", name, node);
		} else if (baseTypeText.startsWith(ROACT_PURE_COMPONENT_TYPE)) {
			return compileRoactClassDeclaration(state, "PureComponent", name, node);
		}

		if (inheritsFromRoact(baseType)) {
			throw new CompilerError(
				`Cannot inherit ${bold(baseTypeText)}, must inherit ${bold("Roact.Component")}\n` +
					ROACT_DERIVED_CLASSES_ERROR,
				node,
				CompilerErrorType.RoactSubClassesNotSupported,
			);
		}
	}

	const extendExp = node.getExtends();
	let baseClassName = "";
	let hasSuper = false;
	if (extendExp) {
		hasSuper = true;
		baseClassName = compileExpression(state, extendExp.getExpression());
	}

	const isExpression = ts.TypeGuards.isClassExpression(node);

	let result = "";
	if (isExpression) {
		if (nameNode) {
			expAlias = state.getNewId();
			result += state.indent + `local ${expAlias};\n`;
			result += state.indent + `do\n`;
		} else {
			result += state.indent + `local ${name};\n`;
			result += state.indent + `do\n`;
		}
	} else {
		if (nameNode && shouldHoist(node, nameNode)) {
			state.pushHoistStack(name);
		} else {
			result += state.indent + `local ${name};\n`;
		}
		result += state.indent + `do\n`;
	}
	state.pushIndent();

	if (hasSuper) {
		result += state.indent + `local super = ${baseClassName};\n`;
	}

	let hasStaticMembers = false;

	let prefix = "";
	if (isExpression) {
		if (nameNode) {
			prefix = `local `;
		}
	}

	if (hasSuper) {
		result += state.indent + prefix + `${name} = setmetatable({`;
	} else {
		result += state.indent + prefix + `${name} = {`;
	}

	state.pushIndent();

	node.getStaticMethods()
		.filter(method => method.getBody() !== undefined)
		.forEach(method => {
			if (!hasStaticMembers) {
				hasStaticMembers = true;
				result += "\n";
			}
			result += compileMethodDeclaration(state, method);
		});

	state.popIndent();

	if (hasSuper) {
		result += `${hasStaticMembers ? state.indent : ""}}, { __index = super });\n`;
	} else {
		result += `${hasStaticMembers ? state.indent : ""}};\n`;
	}

	if (hasSuper) {
		result += state.indent + `${name}.__index = setmetatable({`;
	} else {
		result += state.indent + `${name}.__index = {`;
	}

	state.pushIndent();
	let hasIndexMembers = false;

	const extraInitializers = new Array<string>();
	const instanceProps = node
		.getInstanceProperties()
		// @ts-ignore
		.filter(prop => prop.getParent() === node)
		.filter(prop => !ts.TypeGuards.isGetAccessorDeclaration(prop))
		.filter(prop => !ts.TypeGuards.isSetAccessorDeclaration(prop));

	for (const prop of instanceProps) {
		const propNameNode = prop.getNameNode();
		if (propNameNode) {
			let propStr: string;
			if (ts.TypeGuards.isIdentifier(propNameNode)) {
				const propName = propNameNode.getText();
				propStr = "." + propName;
				checkMethodReserved(propName, prop);
			} else if (ts.TypeGuards.isStringLiteral(propNameNode)) {
				const expStr = compileExpression(state, propNameNode);
				checkMethodReserved(propNameNode.getLiteralText(), prop);
				propStr = `[${expStr}]`;
			} else if (ts.TypeGuards.isNumericLiteral(propNameNode)) {
				const expStr = compileExpression(state, propNameNode);
				propStr = `[${expStr}]`;
			} else {
				// ComputedPropertyName
				const computedExp = propNameNode.getExpression();
				if (ts.TypeGuards.isStringLiteral(computedExp)) {
					checkMethodReserved(computedExp.getLiteralText(), prop);
				}
				const computedExpStr = compileExpression(state, computedExp);
				propStr = `[${computedExpStr}]`;
			}

			if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
				const initializer = prop.getInitializer();
				if (initializer) {
					state.enterPrecedingStatementContext();
					const expStr = compileExpression(state, initializer);
					extraInitializers.push(...state.exitPrecedingStatementContext());
					extraInitializers.push(state.indent + `self${propStr} = ${expStr};\n`);
				}
			}
		}
	}

	node.getInstanceMethods()
		.filter(method => method.getBody() !== undefined)
		.forEach(method => {
			if (!hasIndexMembers) {
				hasIndexMembers = true;
				result += "\n";
			}
			result += compileMethodDeclaration(state, method);
		});

	state.popIndent();

	if (hasSuper) {
		result += `${hasIndexMembers ? state.indent : ""}}, super);\n`;
	} else {
		result += `${hasIndexMembers ? state.indent : ""}};\n`;
	}

	LUA_RESERVED_METAMETHODS.forEach(metamethod => {
		if (getClassMethod(node, metamethod)) {
			if (LUA_UNDEFINABLE_METAMETHODS.indexOf(metamethod) !== -1) {
				throw new CompilerError(
					`Cannot use undefinable Lua metamethod as identifier '${metamethod}' for a class`,
					node,
					CompilerErrorType.UndefinableMetamethod,
				);
			}
			result +=
				state.indent + `${name}.${metamethod} = function(self, ...) return self:${metamethod}(...); end;\n`;
		}
	});

	if (!node.isAbstract()) {
		result += state.indent + `${name}.new = function(...)\n`;
		state.pushIndent();
		result += state.indent + `return ${name}.constructor(setmetatable({}, ${name}), ...);\n`;
		state.popIndent();
		result += state.indent + `end;\n`;
	}

	result += compileConstructorDeclaration(state, name, getConstructor(node), extraInitializers, hasSuper);

	for (const prop of node.getStaticProperties()) {
		const propNameNode = prop.getNameNode();
		if (propNameNode) {
			let propStr: string;
			if (ts.TypeGuards.isIdentifier(propNameNode)) {
				const propName = propNameNode.getText();
				propStr = "." + propName;
				checkMethodReserved(propName, prop);
			} else if (ts.TypeGuards.isStringLiteral(propNameNode)) {
				const expStr = compileExpression(state, propNameNode);
				checkMethodReserved(propNameNode.getLiteralText(), prop);
				propStr = `[${expStr}]`;
			} else if (ts.TypeGuards.isNumericLiteral(propNameNode)) {
				const expStr = compileExpression(state, propNameNode);
				propStr = `[${expStr}]`;
			} else {
				// ComputedPropertyName
				const computedExp = propNameNode.getExpression();
				if (ts.TypeGuards.isStringLiteral(computedExp)) {
					checkMethodReserved(computedExp.getLiteralText(), prop);
				}
				const computedExpStr = compileExpression(state, computedExp);
				propStr = `[${computedExpStr}]`;
			}

			let propValue = "nil";
			if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
				const initializer = prop.getInitializer();
				if (initializer) {
					state.enterPrecedingStatementContext();
					propValue = compileExpression(state, initializer);
					result += state.exitPrecedingStatementContextAndJoin();
				}
			}
			result += state.indent + `${name}${propStr} = ${propValue};\n`;
		}
	}

	const getters = node
		.getInstanceProperties()
		.filter((prop): prop is ts.GetAccessorDeclaration => ts.TypeGuards.isGetAccessorDeclaration(prop));
	let ancestorHasGetters = false;
	let ancestorClass: ts.ClassDeclaration | ts.ClassExpression | undefined = node;
	while (!ancestorHasGetters && ancestorClass !== undefined) {
		ancestorClass = ancestorClass.getBaseClass();
		if (ancestorClass !== undefined) {
			const ancestorGetters = ancestorClass
				.getInstanceProperties()
				.filter((prop): prop is ts.GetAccessorDeclaration => ts.TypeGuards.isGetAccessorDeclaration(prop));
			if (ancestorGetters.length > 0) {
				ancestorHasGetters = true;
			}
		}
	}

	if (getters.length > 0 || ancestorHasGetters) {
		if (getters.length > 0) {
			let getterContent = "\n";
			state.pushIndent();
			for (const getter of getters) {
				getterContent += compileAccessorDeclaration(state, getter, getter.getName());
			}
			state.popIndent();
			getterContent += state.indent;
			if (ancestorHasGetters) {
				result +=
					state.indent +
					`${name}._getters = setmetatable({${getterContent}}, { __index = super._getters });\n`;
			} else {
				result += state.indent + `${name}._getters = {${getterContent}};\n`;
			}
		} else {
			result += state.indent + `${name}._getters = super._getters;\n`;
		}
		result += state.indent + `local __index = ${name}.__index;\n`;
		result += state.indent + `${name}.__index = function(self, index)\n`;
		state.pushIndent();
		result += state.indent + `local getter = ${name}._getters[index];\n`;
		result += state.indent + `if getter then\n`;
		state.pushIndent();
		result += state.indent + `return getter(self);\n`;
		state.popIndent();
		result += state.indent + `else\n`;
		state.pushIndent();
		result += state.indent + `return __index[index];\n`;
		state.popIndent();
		result += state.indent + `end;\n`;
		state.popIndent();
		result += state.indent + `end;\n`;
	}

	const setters = node
		.getInstanceProperties()
		.filter((prop): prop is ts.SetAccessorDeclaration => ts.TypeGuards.isSetAccessorDeclaration(prop));
	let ancestorHasSetters = false;
	ancestorClass = node;
	while (!ancestorHasSetters && ancestorClass !== undefined) {
		ancestorClass = ancestorClass.getBaseClass();
		if (ancestorClass !== undefined) {
			const ancestorSetters = ancestorClass
				.getInstanceProperties()
				.filter((prop): prop is ts.GetAccessorDeclaration => ts.TypeGuards.isSetAccessorDeclaration(prop));
			if (ancestorSetters.length > 0) {
				ancestorHasSetters = true;
			}
		}
	}
	if (setters.length > 0 || ancestorHasSetters) {
		if (setters.length > 0) {
			let setterContent = "\n";
			state.pushIndent();
			for (const setter of setters) {
				setterContent += compileAccessorDeclaration(state, setter, setter.getName());
			}
			state.popIndent();
			setterContent += state.indent;
			if (ancestorHasSetters) {
				result +=
					state.indent +
					`${name}._setters = setmetatable({${setterContent}}, { __index = super._setters });\n`;
			} else {
				result += state.indent + `${name}._setters = {${setterContent}};\n`;
			}
		} else {
			result += state.indent + `${name}._setters = super._setters;\n`;
		}
		result += state.indent + `${name}.__newindex = function(self, index, value)\n`;
		state.pushIndent();
		result += state.indent + `local setter = ${name}._setters[index];\n`;
		result += state.indent + `if setter then\n`;
		state.pushIndent();
		result += state.indent + `setter(self, value);\n`;
		state.popIndent();
		result += state.indent + `else\n`;
		state.pushIndent();
		result += state.indent + `rawset(self, index, value);\n`;
		state.popIndent();
		result += state.indent + `end;\n`;
		state.popIndent();
		result += state.indent + `end;\n`;
	}

	if (isExpression) {
		if (nameNode) {
			result += state.indent + `${expAlias} = ${name};\n`;
		}
		state.popIndent();
		result += state.indent + `end;\n`;
		state.pushPrecedingStatements(node, result);
		return expAlias || name;
	} else {
		state.popIndent();
		result += state.indent + `end;\n`;
	}

	return result;
}

export function compileClassDeclaration(state: CompilerState, node: ts.ClassDeclaration) {
	return compileClass(state, node);
}

export function compileClassExpression(state: CompilerState, node: ts.ClassExpression) {
	return compileClass(state, node);
}
