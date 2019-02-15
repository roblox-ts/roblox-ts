import * as ts from "ts-morph";
import { checkApiAccess, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isArrayType, isStringType, isTupleReturnType, typeConstraint } from "../typeUtilities";
import { getParameterData } from "./binding";
import { transpileFunctionBody } from "./function";
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

function getPropertyCallParentIsExpression(subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>) {
	let exp = subExp
		.getParent()
		.getParent()!
		.getParent()!;

	if (ts.TypeGuards.isNonNullExpression(exp)) {
		exp = exp.getExpression();
	}

	return ts.TypeGuards.isExpressionStatement(exp);
}

type ReplaceFunction = (
	accessPath: string,
	params: Array<ts.Node>,
	state: TranspilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
) => string | undefined;

function wrapExpFunc(replacer: (accessPath: string) => string): ReplaceFunction {
	return (accessPath, params, state, subExp) => replacer(wrapExpressionIfNeeded(subExp, accessPath));
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

function areParametersSimple(func: ts.ArrowFunction) {
	if (
		!ts.TypeGuards.isExpression(func.getBody()) &&
		func
			.getBody()
			.getDescendants()
			.some(a => ts.TypeGuards.isReturnStatement(a) || ts.TypeGuards.isReturnTypedNode(a))
	) {
		return false;
	}

	return !func.getParameters().some(param => param.isRestParameter());
}

const ARRAY_REPLACE_METHODS: ReplaceMap = {
	pop: accessPath => `table.remove(${accessPath})`,
	shift: accessPath => `table.remove(${accessPath}, 1)`,

	join: (accessPath, params, state, subExp) => {
		const arrayType = subExp.getType().getArrayType()!;
		const validTypes = arrayType.isUnion() ? arrayType.getUnionTypes() : [arrayType];

		if (validTypes.every(validType => validType.isNumber() || validType.isString())) {
			return `table.concat(${accessPath}, ${params[0] || `", "`})`;
		}
	},

	push: (accessPath, params, state, subExp) => {
		const length = params.length;
		const propertyCallParentIsExpression = getPropertyCallParentIsExpression(subExp);

		if (length === 0 && !propertyCallParentIsExpression) {
			return `(#${accessPath})`;
		} else if (length === 1 && propertyCallParentIsExpression) {
			return `table.insert(${concatParams(state, params, accessPath)})`;
		}
	},

	forEach: (accessPath, params, state, subExp) => {
		const arrayType = subExp.getType().getArrayType()!;
		const validTypes = arrayType.isUnion() ? arrayType.getUnionTypes() : [arrayType];

		const propertyCallParentIsExpression = getPropertyCallParentIsExpression(subExp);
		const callExpression = subExp.getParent().getParent();
		const func = params[0];

		if (
			callExpression &&
			ts.TypeGuards.isCallExpression(callExpression) &&
			propertyCallParentIsExpression &&
			validTypes.every(validType => !validType.isUndefined()) &&
			ts.TypeGuards.isArrowFunction(func) &&
			areParametersSimple(func)
		) {
			const paramNames = new Array<string>();
			const initializers = new Array<string>();

			getParameterData(state, paramNames, initializers, func);
			const valueStr = paramNames[0];
			let arrStr = paramNames[2];
			let result = "";

			if (!arrStr && ts.TypeGuards.isIdentifier(subExp)) {
				arrStr = accessPath;
			} else if (!arrStr || arrStr !== accessPath) {
				arrStr = arrStr || state.getNewId();
				result += `local ${arrStr} = ${accessPath};\n` + state.indent;
			}

			state.pushIdStack();
			const incr = paramNames[1];
			const incrStr = incr || state.getNewId();
			const countStart = incr ? 0 : 1;
			const countOffset = incr ? " - 1" : "";
			const localizeOffset = incr ? " + 1" : "";

			result += `for ${incrStr} = ${countStart}, #${arrStr}${countOffset} do`;
			state.pushIndent();
			if (valueStr) {
				result += "\n" + state.indent + `local ${valueStr} = ${arrStr}[${incrStr}${localizeOffset}];`;
			}

			state.popIndent();
			result += transpileFunctionBody(state, func.getBody(), func, initializers, true) + "end";
			state.popIdStack();

			return result;
		}
	},
};

const MAP_REPLACE_METHODS: ReplaceMap = {
	get: (accessPath, params, state, subExp) => {
		if (!getPropertyCallParentIsExpression(subExp)) {
			return `${accessPath}[${concatParams(state, params)}]`;
		}
	},

	set: (accessPath, params, state, subExp) => {
		if (getPropertyCallParentIsExpression(subExp)) {
			return `${accessPath}[${transpileCallArgument(state, params[0])}] = ${transpileCallArgument(
				state,
				params[1],
			)}`;
		}
	},

	has: (accessPath, params, state, subExp) => {
		if (!getPropertyCallParentIsExpression(subExp)) {
			return `(${accessPath}[${concatParams(state, params)}] ~= nil)`;
		}
	},
};

const SET_REPLACE_METHODS: ReplaceMap = {
	add: (accessPath, params, state, subExp) => {
		if (getPropertyCallParentIsExpression(subExp)) {
			return `${accessPath}[${concatParams(state, params)}] = true`;
		}
	},

	delete: (accessPath, params, state, subExp) => {
		if (getPropertyCallParentIsExpression(subExp)) {
			return `${accessPath}[${concatParams(state, params)}] = nil`;
		}
	},

	has: (accessPath, params, state, subExp) => {
		if (!getPropertyCallParentIsExpression(subExp)) {
			return `(${accessPath}[${concatParams(state, params)}] ~= nil)`;
		}
	},
};

const RBX_MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];

export function transpileCallArgument(state: TranspilerState, arg: ts.Node) {
	const expStr = transpileExpression(state, arg as ts.Expression);
	if (!ts.TypeGuards.isSpreadElement(arg)) {
		checkNonAny(arg);
	}
	return expStr;
}

export function transpileCallArguments(state: TranspilerState, args: Array<ts.Node>) {
	const argStrs = new Array<string>();
	for (const arg of args) {
		argStrs.push(transpileCallArgument(state, arg));
	}
	return argStrs;
}

function concatParams(state: TranspilerState, myParams: Array<ts.Node>, accessPath?: string) {
	const params = transpileCallArguments(state, myParams);
	if (accessPath) {
		params.unshift(accessPath);
	}
	return params.join(", ");
}

export function transpileCallExpression(state: TranspilerState, node: ts.CallExpression, doNotWrapTupleReturn = false) {
	const exp = node.getExpression();
	checkNonAny(exp);
	if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
		return transpilePropertyCallExpression(state, node, doNotWrapTupleReturn);
	} else {
		const params = node.getArguments();

		if (ts.TypeGuards.isSuperExpression(exp)) {
			return `super.constructor(${concatParams(state, params, "self")})`;
		}

		const callPath = transpileExpression(state, exp);
		let result = `${callPath}(${concatParams(state, params)})`;
		if (!doNotWrapTupleReturn && isTupleReturnType(node)) {
			result = `{ ${result} }`;
		}
		return result;
	}
}

function transpilePropertyMethod(
	state: TranspilerState,
	property: string,
	accessPath: string,
	params: Array<ts.Node>,
	subExp: ts.LeftHandSideExpression,
	className: string,
	replaceMethods: ReplaceMap,
) {
	console.log(SET_REPLACE_METHODS.toString());
	const isSubstitutableMethod = replaceMethods[property];

	if (isSubstitutableMethod) {
		const str = isSubstitutableMethod(accessPath, params, state, subExp);
		if (str) {
			return str;
		}
	}

	state.usesTSLibrary = true;
	return `TS.${className}_${property}(${concatParams(state, params, accessPath)})`;
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
	const params = node.getArguments();

	if (isArrayType(subExpType)) {
		return transpilePropertyMethod(state, property, accessPath, params, subExp, "array", ARRAY_REPLACE_METHODS);
	}

	if (isStringType(subExpType)) {
		if (STRING_MACRO_METHODS.indexOf(property) !== -1) {
			return `${wrapExpressionIfNeeded(subExp, accessPath)}:${property}(${concatParams(state, params)})`;
		}

		return transpilePropertyMethod(state, property, accessPath, params, subExp, "string", STRING_REPLACE_METHODS);
	}

	const subExpTypeSym = subExpType.getSymbol();
	if (subExpTypeSym && ts.TypeGuards.isPropertyAccessExpression(expression)) {
		const subExpTypeName = subExpTypeSym.getEscapedName();

		// custom promises
		if (subExpTypeName === "Promise") {
			if (property === "then") {
				return `${accessPath}:andThen(${concatParams(state, params)})`;
			}
		}

		// for is a reserved word in Lua
		if (subExpTypeName === "SymbolConstructor") {
			if (property === "for") {
				return `${accessPath}.getFor(${concatParams(state, params)})`;
			}
		}

		if (subExpTypeName === "Map" || subExpTypeName === "ReadonlyMap" || subExpTypeName === "WeakMap") {
			return transpilePropertyMethod(state, property, accessPath, params, subExp, "map", MAP_REPLACE_METHODS);
		}

		if (subExpTypeName === "Set" || subExpTypeName === "ReadonlySet" || subExpTypeName === "WeakSet") {
			return transpilePropertyMethod(state, property, accessPath, params, subExp, "set", SET_REPLACE_METHODS);
		}

		if (subExpTypeName === "ObjectConstructor") {
			state.usesTSLibrary = true;
			return `TS.Object_${property}(${concatParams(state, params)})`;
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
					return `(${accessPath} + (${concatParams(state, params)}))`;
				case "sub":
					validateMathCall();
					return `(${accessPath} - (${concatParams(state, params)}))`;
				case "mul":
					validateMathCall();
					return `(${accessPath} * (${concatParams(state, params)}))`;
				case "div":
					validateMathCall();
					return `(${accessPath} / (${concatParams(state, params)}))`;
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
	let extraParam = "";
	if (allMethods && !allCallbacks) {
		if (ts.TypeGuards.isSuperExpression(subExp)) {
			accessPath = "super.__index";
			extraParam = "self";
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

	let result = `${accessPath}${sep}${property}(${concatParams(state, params, extraParam)})`;
	if (!doNotWrapTupleReturn && isTupleReturnType(node)) {
		result = `{ ${result} }`;
	}
	return result;
}
