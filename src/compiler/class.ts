import * as ts from "ts-morph";
import {
	checkMethodReserved,
	checkReserved,
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
import {
	shouldHoist,
	superExpressionClassInheritsFromArray,
	superExpressionClassInheritsFromSetOrMap,
} from "../typeUtilities";
import { bold, getNonNullUnParenthesizedExpressionDownwards } from "../utility";

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
			const type = baseTypeText.slice(6) as "Component" | "PureComponent";
			return compileRoactClassDeclaration(state, type, name, node);
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
	let hasSuper = false;
	const results = new Array<string>();

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

	if (extendExp) {
		const extendExpExp = extendExp.getExpression();
		hasSuper = !superExpressionClassInheritsFromArray(extendExpExp, false);

		if (superExpressionClassInheritsFromSetOrMap(extendExpExp)) {
			throw new CompilerError(
				"Cannot create a class which inherits from Map or Set!",
				extendExpExp,
				CompilerErrorType.BadClassExtends,
			);
		}

		state.enterPrecedingStatementContext(results);
		if (hasSuper) {
			results.push(state.indent + `local super = ${compileExpression(state, extendExp.getExpression())};\n`);
		}
		state.exitPrecedingStatementContext();
	}

	results.push(
		state.indent,
		isExpression && nameNode ? "local " : "",
		name,
		" = ",
		hasSuper ? "setmetatable(" : "",
		"{}",
		hasSuper ? ", { __index = super })" : "",
		";\n",
	);

	for (const method of node.getStaticMethods()) {
		if (method.getBody() !== undefined) {
			const methodName = method.getName();
			if (methodName === "new" || LUA_RESERVED_METAMETHODS.includes(methodName)) {
				throw new CompilerError(
					`Cannot make a static method with name "${methodName}"!`,
					method,
					CompilerErrorType.StaticNew,
				);
			}
			results.push(compileMethodDeclaration(state, method));
		}
	}

	results.push(
		state.indent,
		name,
		".__index = ",
		hasSuper ? "setmetatable(" : "",
		"{}",
		hasSuper ? ", super)" : "",
		";\n",
	);

	state.pushIndent();

	const extraInitializers = new Array<string>();

	for (const prop of node.getInstanceProperties()) {
		if (ts.TypeGuards.isGetAccessorDeclaration(prop) || ts.TypeGuards.isSetAccessorDeclaration(prop)) {
			throw new CompilerError(
				"Getters and Setters are disallowed! See https://github.com/roblox-ts/roblox-ts/issues/457",
				node,
				CompilerErrorType.GettersSettersDisallowed,
			);
		}

		if (prop.getParent()! === node) {
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
	}
	state.popIndent();

	for (const method of node.getInstanceMethods()) {
		if (method.getBody() !== undefined) {
			results.push(compileMethodDeclaration(state, method, name + ".__index:"));
		}
	}

	for (const metamethod of LUA_RESERVED_METAMETHODS) {
		// TODO: fix static vs non-static __tostring method
		if (getClassMethod(node, metamethod)) {
			if (LUA_UNDEFINABLE_METAMETHODS.has(metamethod)) {
				throw new CompilerError(
					`Cannot use undefinable Lua metamethod as identifier '${metamethod}' for a class`,
					node,
					CompilerErrorType.UndefinableMetamethod,
				);
			}

			results.push(state.indent + `function ${name}:${metamethod}(...) return self:${metamethod}(...); end;\n`);
		}
	}

	if (!node.isAbstract()) {
		results.push(
			state.indent + `function ${name}.new(...)\n`,
			state.indent + `\tlocal self = setmetatable({}, ${name});\n`,
			state.indent + `\t${name}.constructor(self, ...);\n`,
			state.indent + `\treturn self;\n`,
			state.indent + `end;\n`,
		);
	}

	results.push(compileConstructorDeclaration(state, node, name, getConstructor(node), extraInitializers, hasSuper));

	for (const prop of node.getStaticProperties()) {
		if (ts.TypeGuards.isGetAccessorDeclaration(prop) || ts.TypeGuards.isSetAccessorDeclaration(prop)) {
			throw new CompilerError(
				"Getters and Setters are disallowed! See https://github.com/roblox-ts/roblox-ts/issues/457",
				node,
				CompilerErrorType.GettersSettersDisallowed,
			);
		}
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
