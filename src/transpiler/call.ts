import * as ts from "ts-morph";
import { checkApiAccess, checkNonAny, transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isArrayType, isStringType, isTupleReturnTypeCall, typeConstraint } from "../typeUtilities";

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

function wrapExpressionIfNeeded(
	state: TranspilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
) {
	// If we transpile to a method call, we might need to wrap in parenthesis
	// We are always going to wrap in parenthesis just to be safe,
	// unless it's a CallExpression, Identifier, ElementAccessExpression, or PropertyAccessExpression

	const accessPath = transpileExpression(state, subExp);

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

function getLeftHandSideParent(subExp: ts.Node, climb: number = 3) {
	let exp = subExp;

	for (let _ = 0; _ < climb; _++) {
		exp = exp.getParent();
		while (ts.TypeGuards.isNonNullExpression(exp)) {
			exp = exp.getExpression();
		}
	}

	return exp;
}

function transpileLiterally(
	params: Array<ts.Node>,
	state: TranspilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
	funcName: "set" | "add",
	transpileParamFunc: (argumentList: Array<ts.Node>) => string,
) {
	// and subExp is inside a VariableDeclaration, check if we can transpile an object literal
	if (ts.TypeGuards.isVariableDeclaration(getLeftHandSideParent(subExp))) {
		let child: ts.Node = subExp;
		const extraParams = new Array<Array<ts.Node>>();

		// Walk down the tree, making sure all descendants of subExp are .set() calls
		while (ts.TypeGuards.isCallExpression(child)) {
			extraParams.push(child.getArguments());
			child = child.getChildAtIndex(0);

			if (ts.TypeGuards.isPropertyAccessExpression(child) && child.getName() === funcName) {
				child = child.getChildAtIndex(0);
			} else {
				break;
			}
		}

		// if all set calls are on a newExpression
		if (child && ts.TypeGuards.isNewExpression(child)) {
			state.pushIndent();
			let result = extraParams.reduceRight((a, x) => (a += state.indent + transpileParamFunc(x)), "{\n");
			result += state.indent + transpileParamFunc(params);
			state.popIndent();
			result += state.indent + "}";
			return result;
		}
	}
}

function getIsExpression(subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>, parent: ts.Node) {
	return !ts.TypeGuards.isNewExpression(subExp) && ts.TypeGuards.isExpressionStatement(parent);
}

function getPropertyCallParentIsExpression(subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>) {
	return getIsExpression(subExp, getLeftHandSideParent(subExp));
}

function getCallParentIsExpression(subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>) {
	return getIsExpression(subExp, getLeftHandSideParent(subExp, 2));
}

type SimpleReplaceFunction = (
	accessPath: string,
	params: Array<ts.Node>,
	state: TranspilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
) => string | undefined;

type ReplaceFunction = (
	params: Array<ts.Node>,
	state: TranspilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
) => string | undefined;

type ReplaceMap = Map<string, ReplaceFunction>;

function wrapExpFunc(replacer: (accessPath: string) => string): ReplaceFunction {
	return (params, state, subExp) => replacer(wrapExpressionIfNeeded(state, subExp));
}

function accessPathWrap(replacer: SimpleReplaceFunction): ReplaceFunction {
	return (params, state, subExp) => replacer(transpileExpression(state, subExp), params, state, subExp);
}

const STRING_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("trim", wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)%s*$")`))
	.set("trimLeft", wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)$")`))
	.set("trimRight", wrapExpFunc(accessPath => `${accessPath}:match("^(.-)%s*$")`));

STRING_REPLACE_METHODS.set("trimStart", STRING_REPLACE_METHODS.get("trimLeft")!);
STRING_REPLACE_METHODS.set("trimEnd", STRING_REPLACE_METHODS.get("trimRight")!);

const ARRAY_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("pop", accessPathWrap(accessPath => `table.remove(${accessPath})`))
	.set("shift", accessPathWrap(accessPath => `table.remove(${accessPath}, 1)`))

	.set("join", (params, state, subExp) => {
		const arrayType = subExp.getType().getArrayType()!;
		const validTypes = arrayType.isUnion() ? arrayType.getUnionTypes() : [arrayType];

		if (validTypes.every(validType => validType.isNumber() || validType.isString())) {
			const paramStr = params[0] ? transpileCallArgument(state, params[0]) : `", "`;
			const accessPath = transpileExpression(state, subExp);
			return `table.concat(${accessPath}, ${paramStr})`;
		}
	})

	.set("push", (params, state, subExp) => {
		const length = params.length;
		const propertyCallParentIsExpression = getPropertyCallParentIsExpression(subExp);
		if (length === 1 && propertyCallParentIsExpression) {
			const paramStr = transpileCallArgument(state, params[0]);
			const accessPath = transpileExpression(state, subExp);

			if (ts.TypeGuards.isIdentifier(subExp)) {
				return `${accessPath}[#${accessPath} + 1] = ${paramStr}`;
			} else {
				return `table.insert(${accessPath}, ${paramStr})`;
			}
		}
	})

	.set("unshift", (params, state, subExp) => {
		const length = params.length;
		const propertyCallParentIsExpression = getPropertyCallParentIsExpression(subExp);
		if (length === 1 && propertyCallParentIsExpression) {
			const paramStr = transpileCallArgument(state, params[0]);
			const accessPath = transpileExpression(state, subExp);
			return `table.insert(${accessPath}, 1, ${paramStr})`;
		}
	})

	.set(
		"insert",
		accessPathWrap((accessPath, params, state) => {
			const indexParamStr = transpileCallArgument(state, params[0]);
			const valueParamStr = transpileCallArgument(state, params[1]);
			return `table.insert(${accessPath}, ${indexParamStr} + 1, ${valueParamStr})`;
		}),
	)

	.set(
		"remove",
		accessPathWrap((accessPath, params, state) => {
			const indexParamStr = transpileCallArgument(state, params[0]);
			return `table.remove(${accessPath}, ${indexParamStr} + 1)`;
		}),
	);

const MAP_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("get", (params, state, subExp) => {
		if (!getPropertyCallParentIsExpression(subExp)) {
			const accessPath = transpileExpression(state, subExp);
			const key = transpileCallArgument(state, params[0]);
			return `${accessPath}[${key}]`;
		}
	})

	.set("set", (params, state, subExp) => {
		const literalResults = transpileLiterally(params, state, subExp, "set", (argumentList: Array<ts.Node>) => {
			const key = transpileCallArgument(state, argumentList[0]);
			const value = transpileCallArgument(state, argumentList[1]);
			return `[${key}] = ${value};\n`;
		});

		if (literalResults) {
			return literalResults;
		} else {
			if (getPropertyCallParentIsExpression(subExp)) {
				const key = transpileCallArgument(state, params[0]);
				const value = transpileCallArgument(state, params[1]);
				const accessPath = transpileExpression(state, subExp);
				return `${accessPath}[${key}] = ${value}`;
			}
		}
	})

	.set("delete", (params, state, subExp) => {
		if (getPropertyCallParentIsExpression(subExp)) {
			const accessPath = transpileExpression(state, subExp);
			const key = transpileCallArgument(state, params[0]);
			return `${accessPath}[${key}] = nil`;
		}
	})

	.set("has", (params, state, subExp) => {
		if (!getPropertyCallParentIsExpression(subExp)) {
			const accessPath = transpileExpression(state, subExp);
			const key = transpileCallArgument(state, params[0]);
			return `(${accessPath}[${key}] ~= nil)`;
		}
	});

const SET_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("add", (params, state, subExp) => {
		const literalResults = transpileLiterally(params, state, subExp, "add", (argumentList: Array<ts.Node>) => {
			const key = transpileCallArgument(state, argumentList[0]);
			return `[${key}] = true;\n`;
		});

		if (literalResults) {
			return literalResults;
		} else {
			if (getPropertyCallParentIsExpression(subExp)) {
				const accessPath = transpileExpression(state, subExp);
				const key = transpileCallArgument(state, params[0]);
				return `${accessPath}[${key}] = true`;
			}
		}
	})

	.set("delete", (params, state, subExp) => {
		if (getPropertyCallParentIsExpression(subExp)) {
			const accessPath = transpileExpression(state, subExp);
			const key = transpileCallArgument(state, params[0]);
			return `${accessPath}[${key}] = nil`;
		}
	})

	.set("has", (params, state, subExp) => {
		if (!getPropertyCallParentIsExpression(subExp)) {
			const accessPath = transpileExpression(state, subExp);
			const key = transpileCallArgument(state, params[0]);
			return `(${accessPath}[${key}] ~= nil)`;
		}
	});

const RBX_MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];

const GLOBAL_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>().set("typeIs", (params, state, subExp) => {
	if (!getCallParentIsExpression(subExp)) {
		const obj = transpileCallArgument(state, params[0]);
		const type = transpileCallArgument(state, params[1]);
		return `(typeof(${obj}) == ${type})`;
	}
});

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

export function transpileCallExpression(
	state: TranspilerState,
	node: ts.CallExpression,
	doNotWrapTupleReturn = !isTupleReturnTypeCall(node),
) {
	const exp = node.getExpression();
	if (exp.getKindName() === "ImportKeyword") {
		throw new TranspilerError(
			"Dynamic import expressions are not supported! Use 'require()' instead and assert the type.",
			node,
			TranspilerErrorType.NoDynamicImport,
		);
	}
	checkNonAny(exp);
	let result: string;

	if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
		result = transpilePropertyCallExpression(state, node);
	} else {
		const params = node.getArguments();

		if (ts.TypeGuards.isSuperExpression(exp)) {
			return `super.constructor(${concatParams(state, params, "self")})`;
		}

		const isSubstitutableMethod = GLOBAL_REPLACE_METHODS.get(exp.getText());

		if (isSubstitutableMethod) {
			const str = isSubstitutableMethod(params, state, exp);
			if (str) {
				return str;
			}
		}

		const callPath = transpileExpression(state, exp);
		result = `${callPath}(${concatParams(state, params)})`;
	}

	if (!doNotWrapTupleReturn) {
		result = `{ ${result} }`;
	}

	return result;
}

function transpilePropertyMethod(
	state: TranspilerState,
	property: string,
	params: Array<ts.Node>,
	subExp: ts.LeftHandSideExpression,
	className: string,
	replaceMethods: ReplaceMap,
) {
	const isSubstitutableMethod = replaceMethods.get(property);

	if (isSubstitutableMethod) {
		const str = isSubstitutableMethod(params, state, subExp);
		if (str) {
			return str;
		}
	}

	const accessPath = transpileExpression(state, subExp);
	state.usesTSLibrary = true;
	return `TS.${className}_${property}(${concatParams(state, params, accessPath)})`;
}

export const enum PropertyCallExpType {
	None = -1,
	Array,
	BuiltInStringMethod,
	String,
	PromiseThen,
	SymbolFor,
	Map,
	Set,
	ObjectConstructor,
	RbxMathAdd,
	RbxMathSub,
	RbxMathMul,
	RbxMathDiv,
}

export function getPropertyAccessExpressionType(
	state: TranspilerState,
	node: ts.CallExpression | ts.PropertyAccessExpression,
	expression: ts.PropertyAccessExpression,
): PropertyCallExpType {
	checkApiAccess(state, expression.getNameNode());

	const subExp = expression.getExpression();
	const subExpType = subExp.getType();
	const property = expression.getName();

	if (isArrayType(subExpType)) {
		return PropertyCallExpType.Array;
	}

	if (isStringType(subExpType)) {
		if (STRING_MACRO_METHODS.indexOf(property) !== -1) {
			return PropertyCallExpType.BuiltInStringMethod;
		}

		return PropertyCallExpType.String;
	}

	const subExpTypeSym = subExpType.getSymbol();
	if (subExpTypeSym && ts.TypeGuards.isPropertyAccessExpression(expression)) {
		const subExpTypeName = subExpTypeSym.getEscapedName();

		// custom promises
		if (subExpTypeName === "Promise") {
			if (property === "then") {
				return PropertyCallExpType.PromiseThen;
			}
		}

		// for is a reserved word in Lua
		if (subExpTypeName === "SymbolConstructor") {
			if (property === "for") {
				return PropertyCallExpType.SymbolFor;
			}
		}

		if (subExpTypeName === "Map" || subExpTypeName === "ReadonlyMap" || subExpTypeName === "WeakMap") {
			return PropertyCallExpType.Map;
		}

		if (subExpTypeName === "Set" || subExpTypeName === "ReadonlySet" || subExpTypeName === "WeakSet") {
			return PropertyCallExpType.Set;
		}

		if (subExpTypeName === "ObjectConstructor") {
			return PropertyCallExpType.ObjectConstructor;
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
					return PropertyCallExpType.RbxMathAdd;
				case "sub":
					validateMathCall();
					return PropertyCallExpType.RbxMathSub;
				case "mul":
					validateMathCall();
					return PropertyCallExpType.RbxMathMul;
				case "div":
					validateMathCall();
					return PropertyCallExpType.RbxMathDiv;
			}
		}
	}

	return PropertyCallExpType.None;
}

export function transpilePropertyCallExpression(state: TranspilerState, node: ts.CallExpression) {
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
	const property = expression.getName();
	const params = node.getArguments();

	switch (getPropertyAccessExpressionType(state, node, expression)) {
		case PropertyCallExpType.Array:
			return transpilePropertyMethod(state, property, params, subExp, "array", ARRAY_REPLACE_METHODS);
		case PropertyCallExpType.BuiltInStringMethod:
			return `${wrapExpressionIfNeeded(state, subExp)}:${property}(${concatParams(state, params)})`;
		case PropertyCallExpType.String:
			return transpilePropertyMethod(state, property, params, subExp, "string", STRING_REPLACE_METHODS);
		case PropertyCallExpType.PromiseThen:
			return `${transpileExpression(state, subExp)}:andThen(${concatParams(state, params)})`;
		case PropertyCallExpType.SymbolFor:
			return `${transpileExpression(state, subExp)}.getFor(${concatParams(state, params)})`;
		case PropertyCallExpType.Map:
			return transpilePropertyMethod(state, property, params, subExp, "map", MAP_REPLACE_METHODS);
		case PropertyCallExpType.Set:
			return transpilePropertyMethod(state, property, params, subExp, "set", SET_REPLACE_METHODS);
		case PropertyCallExpType.ObjectConstructor:
			state.usesTSLibrary = true;
			return `TS.Object_${property}(${concatParams(state, params)})`;
		case PropertyCallExpType.RbxMathAdd:
			return `(${transpileExpression(state, subExp)} + (${transpileCallArgument(state, params[0])}))`;
		case PropertyCallExpType.RbxMathSub:
			return `(${transpileExpression(state, subExp)} - (${transpileCallArgument(state, params[0])}))`;
		case PropertyCallExpType.RbxMathMul:
			return `(${transpileExpression(state, subExp)} * (${transpileCallArgument(state, params[0])}))`;
		case PropertyCallExpType.RbxMathDiv:
			return `(${transpileExpression(state, subExp)} / (${transpileCallArgument(state, params[0])}))`;
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

	let accessPath = transpileExpression(state, subExp);
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

	return `${accessPath}${sep}${property}(${concatParams(state, params, extraParam)})`;
}
