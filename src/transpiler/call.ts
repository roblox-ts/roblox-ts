import * as ts from "ts-morph";
import { checkApiAccess, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isArrayType, isTupleReturnType, typeConstraint } from "../typeUtilities";
import { checkNonAny } from "./security";

const STRING_MACRO_METHODS = [
	"byte",
	"find",
	"format",
	"gmatch",
	"gsub",
	"len",
	"lower",
	"match",
	"rep",
	"reverse",
	"sub",
	"upper",
];

function wrapExpressionIfNeeded(subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>, accessPath: string) {
	// If we transpile to a method call, we might need to wrap in parenthesis
	// We are always going to wrap in parenthesis just to be safe,
	// unless it's a CallExpression, Identifier, ElementAccessExpression, or PropertyAccessExpression

	if (
		!(
			ts.TypeGuards.isCallExpression(subExp) ||
			ts.TypeGuards.isIdentifier(subExp) ||
			ts.TypeGuards.isElementAccessExpression(subExp) ||
			ts.TypeGuards.isPropertyAccessExpression(subExp)
		)
	) {
		return `(${accessPath})`;
	} else {
		return accessPath;
	}
}

type ReplaceFunction = (
	accessPath: string,
	params: string,
	state: TranspilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
) => string;

function wrapExpFunc(replacer: (accessPath: string) => string): ReplaceFunction {
	return (
		accessPath: string,
		params: string,
		state: TranspilerState,
		subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
	) => replacer(wrapExpressionIfNeeded(subExp, accessPath));
}

interface ReplaceMap {
	[propName: string]: ReplaceFunction;
}

const STRING_REPLACE_METHODS: ReplaceMap = {
	trim: wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)%s*$")`),
	trimLeft: wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)")`),
	trimRight: wrapExpFunc(accessPath => `${accessPath}:match("(.-)%s*$")`),
};
STRING_REPLACE_METHODS.trimStart = STRING_REPLACE_METHODS.trimLeft;
STRING_REPLACE_METHODS.trimEnd = STRING_REPLACE_METHODS.trimRight;

const ARRAY_REPLACE_METHODS: ReplaceMap = {
	toString: (
		a: string,
		b: string,
		state: TranspilerState,
		subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
	) => `${state.getService("HttpService", subExp)}:JSONEncode(${a})`,
};

const RBX_MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];

export function transpileCallArguments(state: TranspilerState, args: Array<ts.Node>) {
	const argStrs = new Array<string>();
	for (const arg of args) {
		const expStr = transpileExpression(state, arg as ts.Expression);
		if (!ts.TypeGuards.isSpreadElement(arg)) {
			checkNonAny(arg);
		}
		argStrs.push(expStr);
	}
	return argStrs.join(", ");
}

function concatParams(accessPath: string, params: string) {
	if (params.length > 0) {
		return accessPath + ", " + params;
	} else {
		return accessPath;
	}
}

export function transpileCallExpression(state: TranspilerState, node: ts.CallExpression, doNotWrapTupleReturn = false) {
	const exp = node.getExpression();
	checkNonAny(exp);
	if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
		return transpilePropertyCallExpression(state, node, doNotWrapTupleReturn);
	} else if (ts.TypeGuards.isSuperExpression(exp)) {
		const params = concatParams("self", transpileCallArguments(state, node.getArguments()));
		return `super.constructor(${params})`;
	} else {
		const callPath = transpileExpression(state, exp);
		const params = transpileCallArguments(state, node.getArguments());
		let result = `${callPath}(${params})`;
		if (!doNotWrapTupleReturn && isTupleReturnType(node)) {
			result = `{ ${result} }`;
		}
		return result;
	}
}

export function transpilePropertyCallExpression(
	state: TranspilerState,
	node: ts.CallExpression,
	doNotWrapTupleReturn = false,
) {
	const expression = node.getExpression();
	if (!ts.TypeGuards.isPropertyAccessExpression(expression)) {
		throw new TranspilerError(
			"Expected PropertyAccessExpression",
			node,
			TranspilerErrorType.ExpectedPropertyAccessExpression,
		);
	}

	checkApiAccess(state, expression.getNameNode());

	const subExp = expression.getExpression();
	const subExpType = subExp.getType();
	let accessPath = transpileExpression(state, subExp);
	const property = expression.getName();
	let params = transpileCallArguments(state, node.getArguments());

	if (isArrayType(subExpType)) {
		const isSubstitutableMethod = ARRAY_REPLACE_METHODS[property];

		if (isSubstitutableMethod) {
			return isSubstitutableMethod(accessPath, params, state, subExp);
		}
		state.usesTSLibrary = true;
		return `TS.array_${property}(${concatParams(accessPath, params)})`;
	}

	if (subExpType.isString() || subExpType.isStringLiteral()) {
		const isSubstitutableMethod = STRING_REPLACE_METHODS[property];

		if (isSubstitutableMethod) {
			return isSubstitutableMethod(accessPath, params, state, subExp);
		} else if (STRING_MACRO_METHODS.indexOf(property) !== -1) {
			return `${wrapExpressionIfNeeded(subExp, accessPath)}:${property}(${params})`;
		}

		state.usesTSLibrary = true;
		return `TS.string_${property}(${concatParams(accessPath, params)})`;
	}

	const subExpTypeSym = subExpType.getSymbol();
	if (subExpTypeSym && ts.TypeGuards.isPropertyAccessExpression(expression)) {
		const subExpTypeName = subExpTypeSym.getEscapedName();

		// custom promises
		if (subExpTypeName === "Promise") {
			if (property === "then") {
				return `${accessPath}:andThen(${params})`;
			}
		}

		// for is a reserved word in Lua
		if (subExpTypeName === "SymbolConstructor") {
			if (property === "for") {
				return `${accessPath}.getFor(${params})`;
			}
		}

		if (subExpTypeName === "Map" || subExpTypeName === "ReadonlyMap" || subExpTypeName === "WeakMap") {
			state.usesTSLibrary = true;
			return `TS.map_${property}(${concatParams(accessPath, params)})`;
		}

		if (subExpTypeName === "Set" || subExpTypeName === "ReadonlySet" || subExpTypeName === "WeakSet") {
			state.usesTSLibrary = true;
			return `TS.set_${property}(${concatParams(accessPath, params)})`;
		}

		if (subExpTypeName === "ObjectConstructor") {
			state.usesTSLibrary = true;
			return `TS.Object_${property}(${params})`;
		}

		const validateMathCall = () => {
			if (ts.TypeGuards.isExpressionStatement(node.getParent())) {
				throw new TranspilerError(
					`${subExpTypeName}.${property}() cannot be an expression statement!`,
					node,
					TranspilerErrorType.NoMacroMathExpressionStatement,
				);
			}
		};

		// custom math
		if (RBX_MATH_CLASSES.indexOf(subExpTypeName) !== -1) {
			switch (property) {
				case "add":
					validateMathCall();
					return `(${accessPath} + (${params}))`;
				case "sub":
					validateMathCall();
					return `(${accessPath} - (${params}))`;
				case "mul":
					validateMathCall();
					return `(${accessPath} * (${params}))`;
				case "div":
					validateMathCall();
					return `(${accessPath} / (${params}))`;
			}
		}
	}

	const expType = expression.getType();

	const allMethods = typeConstraint(expType, t =>
		t
			.getSymbolOrThrow()
			.getDeclarations()
			.every(dec => {
				if (ts.TypeGuards.isParameteredNode(dec)) {
					const thisParam = dec.getParameter("this");
					if (thisParam) {
						const structure = thisParam.getStructure();
						if (structure.type === "void") {
							return false;
						} else if (structure.type === "this") {
							return true;
						}
					}
				}
				if (ts.TypeGuards.isMethodDeclaration(dec) || ts.TypeGuards.isMethodSignature(dec)) {
					return true;
				}
				return false;
			}),
	);

	const allCallbacks = typeConstraint(expType, t =>
		t
			.getSymbolOrThrow()
			.getDeclarations()
			.every(dec => {
				if (ts.TypeGuards.isParameteredNode(dec)) {
					const thisParam = dec.getParameter("this");
					if (thisParam) {
						const structure = thisParam.getStructure();
						if (structure.type === "void") {
							return true;
						} else if (structure.type === "this") {
							return false;
						}
					}
				}
				if (
					ts.TypeGuards.isFunctionTypeNode(dec) ||
					ts.TypeGuards.isPropertySignature(dec) ||
					ts.TypeGuards.isFunctionExpression(dec) ||
					ts.TypeGuards.isArrowFunction(dec) ||
					ts.TypeGuards.isFunctionDeclaration(dec)
				) {
					return true;
				}
				return false;
			}),
	);

	let sep: string;
	if (allMethods && !allCallbacks) {
		if (ts.TypeGuards.isSuperExpression(subExp)) {
			accessPath = "super.__index";
			params = concatParams("self", params);
			sep = ".";
		} else {
			sep = ":";
		}
	} else if (!allMethods && allCallbacks) {
		sep = ".";
	} else {
		// mixed methods and callbacks
		throw new TranspilerError(
			"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
			node,
			TranspilerErrorType.MixedMethodCall,
		);
	}

	let result = `${accessPath}${sep}${property}(${params})`;
	if (!doNotWrapTupleReturn && isTupleReturnType(node)) {
		result = `{ ${result} }`;
	}
	return result;
}
