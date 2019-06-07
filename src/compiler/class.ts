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
import { bold, getNonNullUnParenthesizedExpressionDownwards, multifilter } from "../utility";

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

const LUA_UNDEFINABLE_METAMETHODS = new Set(["__index", "__newindex", "__mode"]);

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
	for (const baseType of node.getBaseTypes()) {
		const baseTypeText = baseType.getText();

		// Handle the special case where we have a roact class
		if (baseTypeText.startsWith(ROACT_COMPONENT_TYPE) || baseTypeText.startsWith(ROACT_PURE_COMPONENT_TYPE)) {
			return compileRoactClassDeclaration(
				state,
				baseTypeText.slice(6) as "Component" | "PureComponent",
				name,
				node,
			);
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
	let results: Array<string>;

	if (extendExp) {
		hasSuper = true;
		state.enterPrecedingStatementContext();
		baseClassName = compileExpression(state, extendExp.getExpression());
		results = state.exitPrecedingStatementContext();
	} else {
		results = [];
	}

	const isExpression = ts.TypeGuards.isClassExpression(node);

	if (isExpression) {
		results.push(state.indent + `local ${nameNode ? (expAlias = state.getNewId()) : name};\n`);
	} else {
		if (nameNode && shouldHoist(node, nameNode)) {
			state.pushHoistStack(name);
		} else {
			results.push(state.indent + `local ${name};\n`);
		}
	}
	results.push(state.indent + `do\n`);
	state.pushIndent();

	if (hasSuper) {
		results.push(state.indent + `local super = ${baseClassName};\n`);
	}

	let hasStaticMethods = false;

	results.push(
		state.indent +
			(isExpression && nameNode ? "local " : "") +
			name +
			" = " +
			(hasSuper ? "setmetatable(" : "") +
			"{",
	);

	state.pushIndent();
	node.getStaticMethods()
		.filter(method => method.getBody() !== undefined)
		.forEach(method => {
			if (!hasStaticMethods) {
				hasStaticMethods = true;
				results.push("\n");
			}
			if (method.getName() === "new") {
				throw new CompilerError(
					'Cannot make a static method with name "new"!',
					method,
					CompilerErrorType.StaticNew,
				);
			}
			results.push(compileMethodDeclaration(state, method));
		});

	state.popIndent();
	results.push((hasStaticMethods ? state.indent : "") + "}" + (hasSuper ? ", { __index = super })" : "") + ";\n");

	results.push(state.indent + `${name}.__index = ${hasSuper ? "setmetatable(" : ""}{`);
	state.pushIndent();
	let hasIndexMembers = false;

	const extraInitializers = new Array<string>();
	const [instanceProps, getters, setters] = multifilter(
		node
			.getInstanceProperties()
			// @ts-ignore
			.filter(prop => prop.getParent() === node),
		3,
		element => {
			if (ts.TypeGuards.isGetAccessorDeclaration(element)) {
				return 1;
			} else if (ts.TypeGuards.isSetAccessorDeclaration(element)) {
				return 2;
			} else {
				return 0;
			}
		},
	) as [Array<ts.ClassInstancePropertyTypes>, Array<ts.GetAccessorDeclaration>, Array<ts.SetAccessorDeclaration>];

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
			} else if (ts.TypeGuards.isComputedPropertyName(propNameNode)) {
				// ComputedPropertyName
				const computedExp = propNameNode.getExpression();
				if (ts.TypeGuards.isStringLiteral(computedExp)) {
					checkMethodReserved(computedExp.getLiteralText(), prop);
				}
				const computedExpStr = compileExpression(state, computedExp);
				propStr = `[${computedExpStr}]`;
			} else {
				throw new CompilerError(
					`Unexpected prop type ${prop.getKindName()} in compileClass`,
					prop,
					CompilerErrorType.UnexpectedPropType,
					true,
				);
			}

			if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
				const initializer = prop.getInitializer();
				if (initializer) {
					state.enterPrecedingStatementContext(extraInitializers);
					const fullInitializer = getNonNullUnParenthesizedExpressionDownwards(initializer);
					state.declarationContext.set(fullInitializer, {
						isIdentifier: false,
						set: `self${propStr}`,
					});
					const expStr = compileExpression(state, initializer);
					state.exitPrecedingStatementContext();
					if (state.declarationContext.delete(fullInitializer)) {
						extraInitializers.push(state.indent + `self${propStr} = ${expStr};\n`);
					}
				}
			}
		}
	}

	for (const method of node.getInstanceMethods()) {
		if (method.getBody() !== undefined) {
			if (!hasIndexMembers) {
				hasIndexMembers = true;
				results.push("\n");
			}
			results.push(compileMethodDeclaration(state, method));
		}
	}

	state.popIndent();
	results.push(`${hasIndexMembers ? state.indent : ""}}${hasSuper ? ", super)" : ""};\n`);

	for (const metamethod of LUA_RESERVED_METAMETHODS) {
		if (getClassMethod(node, metamethod)) {
			if (LUA_UNDEFINABLE_METAMETHODS.has(metamethod)) {
				throw new CompilerError(
					`Cannot use undefinable Lua metamethod as identifier '${metamethod}' for a class`,
					node,
					CompilerErrorType.UndefinableMetamethod,
				);
			}

			results.push(
				state.indent + `${name}.${metamethod} = function(self, ...) return self:${metamethod}(...); end;\n`,
			);
		}
	}

	if (!node.isAbstract()) {
		results.push(
			state.indent + `${name}.new = function(...)\n`,
			state.indent + `\treturn ${name}.constructor(setmetatable({}, ${name}), ...);\n`,
			state.indent + `end;\n`,
		);
	}

	results.push(compileConstructorDeclaration(state, name, getConstructor(node), extraInitializers, hasSuper));

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
					results.push(state.exitPrecedingStatementContextAndJoin());
				}
			}
			results.push(state.indent, name, propStr, " = ", propValue, ";\n");
		}
	}

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
				results.push(
					state.indent +
						`${name}._getters = setmetatable({${getterContent}}, { __index = super._getters });\n`,
				);
			} else {
				results.push(state.indent + `${name}._getters = {${getterContent}};\n`);
			}
		} else {
			results.push(state.indent + `${name}._getters = super._getters;\n`);
		}
		results.push(state.indent + `local __index = ${name}.__index;\n`);
		results.push(state.indent + `${name}.__index = function(self, index)\n`);
		state.pushIndent();
		results.push(state.indent + `local getter = ${name}._getters[index];\n`);
		results.push(state.indent + `if getter then\n`);
		state.pushIndent();
		results.push(state.indent + `return getter(self);\n`);
		state.popIndent();
		results.push(state.indent + `else\n`);
		state.pushIndent();
		results.push(state.indent + `return __index[index];\n`);
		state.popIndent();
		results.push(state.indent + `end;\n`);
		state.popIndent();
		results.push(state.indent + `end;\n`);
	}

	let ancestorHasSetters = false;
	ancestorClass = node;
	while (!ancestorHasSetters && ancestorClass !== undefined) {
		ancestorClass = ancestorClass.getBaseClass();
		if (ancestorClass !== undefined) {
			const ancestorSetters = ancestorClass
				.getInstanceProperties()
				.filter((prop): prop is ts.SetAccessorDeclaration => ts.TypeGuards.isSetAccessorDeclaration(prop));
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
				results.push(
					state.indent +
						`${name}._setters = setmetatable({${setterContent}}, { __index = super._setters });\n`,
				);
			} else {
				results.push(state.indent + `${name}._setters = {${setterContent}};\n`);
			}
		} else {
			results.push(state.indent + `${name}._setters = super._setters;\n`);
		}
		results.push(state.indent + `${name}.__newindex = function(self, index, value)\n`);
		state.pushIndent();
		results.push(state.indent + `local setter = ${name}._setters[index];\n`);
		results.push(state.indent + `if setter then\n`);
		state.pushIndent();
		results.push(state.indent + `setter(self, value);\n`);
		state.popIndent();
		results.push(state.indent + `else\n`);
		state.pushIndent();
		results.push(state.indent + `rawset(self, index, value);\n`);
		state.popIndent();
		results.push(state.indent + `end;\n`);
		state.popIndent();
		results.push(state.indent + `end;\n`);
	}

	if (isExpression) {
		if (nameNode) {
			results.push(state.indent + `${expAlias} = ${name};\n`);
		}
		state.popIndent();
		results.push(state.indent + `end;\n`);
		state.pushPrecedingStatements(node, ...results);
		// Do not classify this as isPushed here.
		return expAlias || name;
	} else {
		state.popIndent();
		results.push(state.indent + `end;\n`);
	}

	return results.join("");
}

export function compileClassDeclaration(state: CompilerState, node: ts.ClassDeclaration) {
	return compileClass(state, node);
}

export function compileClassExpression(state: CompilerState, node: ts.ClassExpression) {
	return compileClass(state, node);
}
