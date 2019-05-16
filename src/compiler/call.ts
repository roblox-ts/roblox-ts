import * as ts from "ts-morph";
import {
	appendDeclarationIfMissing,
	checkApiAccess,
	checkNonAny,
	compileExpression,
	compileSpreadableList,
	shouldCompileAsSpreadableList,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	isArrayMethodType,
	isArrayType,
	isMapMethodType,
	isSetMethodType,
	isStringMethodType,
	isStringType,
	isTupleReturnTypeCall,
	typeConstraint,
} from "../typeUtilities";

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

function shouldWrapExpression(subExp: ts.Node, strict: boolean) {
	return (
		!ts.TypeGuards.isIdentifier(subExp) &&
		!ts.TypeGuards.isElementAccessExpression(subExp) &&
		(strict || (!ts.TypeGuards.isCallExpression(subExp) && !ts.TypeGuards.isPropertyAccessExpression(subExp)))
	);
}

function wrapExpressionIfNeeded(
	state: CompilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
	strict: boolean = false,
) {
	// If we compile to a method call, we might need to wrap in parenthesis
	// We are going to wrap in parenthesis just to be safe,
	// unless it's a CallExpression, Identifier, ElementAccessExpression, or PropertyAccessExpression

	const accessPath = compileExpression(state, subExp);

	if (shouldWrapExpression(subExp, strict)) {
		return `(${accessPath})`;
	} else {
		return accessPath;
	}
}

/** Skips over Null expressions */
export function getNonNull<T extends ts.Node>(exp: T): T {
	while (ts.TypeGuards.isNonNullExpression(exp)) {
		exp = (exp.getExpression() as unknown) as T;
	}

	return exp;
}

function getLeftHandSideParent(subExp: ts.Node, climb: number = 3) {
	let exp = subExp;

	for (let _ = 0; _ < climb; _++) {
		exp = getNonNull(exp.getParent());
	}

	return exp;
}

function compileMapElement(state: CompilerState, argumentList: Array<ts.Node>) {
	const key = compileCallArgument(state, argumentList[0]);
	const value = compileCallArgument(state, argumentList[1]);
	return state.indent + `[${key}] = ${value};\n`;
}

function compileSetElement(state: CompilerState, argument: ts.Node) {
	const key = compileCallArgument(state, argument);
	return state.indent + `[${key}] = true;\n`;
}

function compileSetArrayLiteralParameter(state: CompilerState, elements: Array<ts.Expression>) {
	return elements.reduce((a, x) => a + compileSetElement(state, x), "");
}

function compileMapArrayLiteralParameter(state: CompilerState, elements: Array<ts.Expression>) {
	return elements.reduce((a, x) => {
		if (ts.TypeGuards.isArrayLiteralExpression(x)) {
			return a + compileMapElement(state, x.getElements());
		} else {
			throw new CompilerError("Bad arguments to Map constructor", x, CompilerErrorType.BadBuiltinConstructorCall);
		}
	}, "");
}

export const literalParameterCompileFunctions = new Map<
	"set" | "map",
	(state: CompilerState, elements: Array<ts.Expression>) => string
>([["set", compileSetArrayLiteralParameter], ["map", compileMapArrayLiteralParameter]]);

function compileLiterally(
	state: CompilerState,
	params: Array<ts.Node>,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
	funcName: "set" | "add",
	compileParamFunc: (state: CompilerState, argumentList: Array<ts.Node>) => string,
) {
	const leftHandSideParent = getLeftHandSideParent(subExp);
	if (!getIsExpressionStatement(subExp, leftHandSideParent)) {
		let child: ts.Node = subExp;
		const extraParams = new Array<Array<ts.Node>>();

		// Walk down the tree, making sure all descendants of subExp are .set() calls
		while (ts.TypeGuards.isCallExpression(child)) {
			extraParams.push(child.getArguments());
			child = getNonNull(child.getChildAtIndex(0));

			if (ts.TypeGuards.isPropertyAccessExpression(child) && child.getName() === funcName) {
				child = getNonNull(child.getChildAtIndex(0));
			} else {
				break;
			}
		}

		// if all set calls are on a newExpression
		if (child && ts.TypeGuards.isNewExpression(child)) {
			let result = "{\n";
			state.pushIndent();

			const newArguments = child.getArguments();
			const firstArgument = newArguments[0];

			if (newArguments.length === 1 && ts.TypeGuards.isArrayLiteralExpression(firstArgument)) {
				const elements = firstArgument.getElements();
				result += literalParameterCompileFunctions.get(funcName === "add" ? "set" : "map")!(state, elements);
			} else if (newArguments.length !== 0) {
				state.popIndent();
				return undefined;
			}

			result = extraParams.reduceRight((a, x) => a + compileParamFunc(state, x), result);
			result += compileParamFunc(state, params);
			state.popIndent();
			result += state.indent + "}";
			return appendDeclarationIfMissing(state, leftHandSideParent, result);
		}
	}
}

function getIsExpressionStatement(subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>, parent: ts.Node) {
	return !ts.TypeGuards.isNewExpression(subExp) && ts.TypeGuards.isExpressionStatement(parent);
}

function getPropertyCallParentIsExpressionStatement(subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>) {
	return getIsExpressionStatement(subExp, getLeftHandSideParent(subExp));
}

type SimpleReplaceFunction = (
	accessPath: string,
	params: Array<ts.Node>,
	state: CompilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
) => string | undefined;

type ReplaceFunction = (
	params: Array<ts.Node>,
	state: CompilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
) => string | undefined;

type ReplaceMap = Map<string, ReplaceFunction>;

function wrapExpFunc(replacer: (accessPath: string) => string): ReplaceFunction {
	return (params, state, subExp) => replacer(wrapExpressionIfNeeded(state, subExp));
}

function accessPathWrap(replacer: SimpleReplaceFunction): ReplaceFunction {
	return (params, state, subExp) => replacer(compileExpression(state, subExp), params, state, subExp);
}

const STRING_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("trim", wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)%s*$")`))
	.set("trimLeft", wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)$")`))
	.set("trimRight", wrapExpFunc(accessPath => `${accessPath}:match("^(.-)%s*$")`))
	.set("split", (params, state, subExp) => {
		return `string.split(${wrapExpressionIfNeeded(state, subExp)}, ${compileCallArgument(state, params[0])})`;
	});

STRING_REPLACE_METHODS.set("trimStart", STRING_REPLACE_METHODS.get("trimLeft")!);
STRING_REPLACE_METHODS.set("trimEnd", STRING_REPLACE_METHODS.get("trimRight")!);

const ARRAY_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("pop", accessPathWrap(accessPath => `table.remove(${accessPath})`))
	.set("shift", accessPathWrap(accessPath => `table.remove(${accessPath}, 1)`))

	.set("join", (params, state, subExp) => {
		const arrayType = subExp.getType().getArrayType()!;
		const validTypes = arrayType.isUnion() ? arrayType.getUnionTypes() : [arrayType];

		if (validTypes.every(validType => validType.isNumber() || validType.isString())) {
			const paramStr = params[0] ? compileCallArgument(state, params[0]) : `", "`;
			const accessPath = compileExpression(state, subExp);
			return `table.concat(${accessPath}, ${paramStr})`;
		}
	})

	.set("push", (params, state, subExp) => {
		const length = params.length;
		if (length === 1 && getPropertyCallParentIsExpressionStatement(subExp)) {
			const accessPath = compileExpression(state, subExp);
			const paramStr = compileCallArgument(state, params[0]);

			if (ts.TypeGuards.isIdentifier(subExp)) {
				return `${accessPath}[#${accessPath} + 1] = ${paramStr}`;
			} else {
				return `table.insert(${accessPath}, ${paramStr})`;
			}
		}
	})

	.set("unshift", (params, state, subExp) => {
		const length = params.length;
		if (length === 1 && getPropertyCallParentIsExpressionStatement(subExp)) {
			const accessPath = compileExpression(state, subExp);
			const paramStr = compileCallArgument(state, params[0]);
			return `table.insert(${accessPath}, 1, ${paramStr})`;
		}
	})

	.set(
		"insert",
		accessPathWrap((accessPath, params, state) => {
			const indexParamStr = compileCallArgument(state, params[0]);
			const valueParamStr = compileCallArgument(state, params[1]);
			return `table.insert(${accessPath}, ${indexParamStr} + 1, ${valueParamStr})`;
		}),
	)

	.set(
		"remove",
		accessPathWrap((accessPath, params, state) => {
			const indexParamStr = compileCallArgument(state, params[0]);
			return `table.remove(${accessPath}, ${indexParamStr} + 1)`;
		}),
	)

	.set("isEmpty", (params, state, subExp) =>
		appendDeclarationIfMissing(
			state,
			getLeftHandSideParent(subExp),
			`(next(${compileExpression(state, subExp)}) == nil)`,
		),
	);

const MAP_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("get", (params, state, subExp) => {
		const accessPath = wrapExpressionIfNeeded(state, subExp, true);
		const key = compileCallArgument(state, params[0]);
		return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp), `${accessPath}[${key}]`);
	})

	.set("set", (params, state, subExp) => {
		const literalResults = compileLiterally(state, params, subExp, "set", (stately, argumentList) =>
			compileMapElement(stately, argumentList),
		);
		if (literalResults) {
			return literalResults;
		} else {
			if (getPropertyCallParentIsExpressionStatement(subExp)) {
				const accessPath = wrapExpressionIfNeeded(state, subExp, true);
				const key = compileCallArgument(state, params[0]);
				const value = compileCallArgument(state, params[1]);
				return `${accessPath}[${key}] = ${value}`;
			}
		}
	})

	.set("delete", (params, state, subExp) => {
		if (getPropertyCallParentIsExpressionStatement(subExp)) {
			const accessPath = wrapExpressionIfNeeded(state, subExp, true);
			const key = compileCallArgument(state, params[0]);
			return `${accessPath}[${key}] = nil`;
		}
	})

	.set("has", (params, state, subExp) => {
		const accessPath = wrapExpressionIfNeeded(state, subExp, true);
		const key = compileCallArgument(state, params[0]);
		return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp), `(${accessPath}[${key}] ~= nil)`);
	})

	.set("isEmpty", (params, state, subExp) =>
		appendDeclarationIfMissing(
			state,
			getLeftHandSideParent(subExp),
			`(next(${compileExpression(state, subExp)}) == nil)`,
		),
	);

const SET_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("add", (params, state, subExp) => {
		const literalResults = compileLiterally(state, params, subExp, "add", (stately, argumentList) =>
			compileSetElement(stately, argumentList[0]),
		);

		if (literalResults) {
			return literalResults;
		} else {
			if (getPropertyCallParentIsExpressionStatement(subExp)) {
				const accessPath = wrapExpressionIfNeeded(state, subExp, true);
				const key = compileCallArgument(state, params[0]);
				return `${accessPath}[${key}] = true`;
			}
		}
	})

	.set("delete", (params, state, subExp) => {
		if (getPropertyCallParentIsExpressionStatement(subExp)) {
			const accessPath = wrapExpressionIfNeeded(state, subExp, true);
			const key = compileCallArgument(state, params[0]);
			return `${accessPath}[${key}] = nil`;
		}
	})

	.set("has", (params, state, subExp) => {
		const accessPath = wrapExpressionIfNeeded(state, subExp, true);
		const key = compileCallArgument(state, params[0]);
		return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp), `(${accessPath}[${key}] == true)`);
	})

	.set("isEmpty", (params, state, subExp) =>
		appendDeclarationIfMissing(
			state,
			getLeftHandSideParent(subExp),
			`(next(${compileExpression(state, subExp)}) == nil)`,
		),
	);

const OBJECT_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>().set("isEmpty", (params, state, subExp) =>
	appendDeclarationIfMissing(
		state,
		getLeftHandSideParent(subExp),
		`(next(${compileCallArgument(state, params[0])}) == nil)`,
	),
);

const RBX_MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];

const GLOBAL_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>().set("typeIs", (params, state, subExp) => {
	const obj = compileCallArgument(state, params[0]);
	const type = compileCallArgument(state, params[1]);
	return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp, 2), `(typeof(${obj}) == ${type})`);
});

export function compileCallArgument(state: CompilerState, arg: ts.Node) {
	const expStr = compileExpression(state, arg as ts.Expression);
	if (!ts.TypeGuards.isSpreadElement(arg)) {
		checkNonAny(arg);
	}
	return expStr;
}

export function compileCallArguments(state: CompilerState, args: Array<ts.Expression>, extraParameter?: string) {
	if (shouldCompileAsSpreadableList(args)) {
		return `unpack(${compileSpreadableList(state, args)})`;
	} else {
		const argStrs = new Array<string>();
		for (const arg of args) {
			argStrs.push(compileCallArgument(state, arg));
		}
		if (extraParameter) {
			argStrs.unshift(extraParameter);
		}
		return argStrs.join(", ");
	}
}

export function compileCallExpression(
	state: CompilerState,
	node: ts.CallExpression,
	doNotWrapTupleReturn = !isTupleReturnTypeCall(node),
) {
	const exp = node.getExpression();
	if (exp.getKindName() === "ImportKeyword") {
		throw new CompilerError(
			"Dynamic import expressions are not supported! Use 'require()' instead and assert the type.",
			node,
			CompilerErrorType.NoDynamicImport,
		);
	}
	checkNonAny(exp);
	let result: string;

	if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
		result = compilePropertyCallExpression(state, node);
	} else {
		const params = node.getArguments() as Array<ts.Expression>;

		if (ts.TypeGuards.isSuperExpression(exp)) {
			return `super.constructor(${compileCallArguments(state, params, "self")})`;
		}

		const isSubstitutableMethod = GLOBAL_REPLACE_METHODS.get(exp.getText());

		if (isSubstitutableMethod) {
			const str = isSubstitutableMethod(params, state, exp);
			if (str) {
				return str;
			}
		}

		const callPath = compileExpression(state, exp);
		result = `${callPath}(${compileCallArguments(state, params)})`;
	}

	if (!doNotWrapTupleReturn) {
		result = `{ ${result} }`;
	}

	return result;
}

function compilePropertyMethod(
	state: CompilerState,
	property: string,
	params: Array<ts.Expression>,
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

	const accessPath = className === "Object" ? undefined : compileExpression(state, subExp);
	state.usesTSLibrary = true;
	return `TS.${className}_${property}(${compileCallArguments(state, params, accessPath)})`;
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
	state: CompilerState,
	expression: ts.PropertyAccessExpression,
): PropertyCallExpType {
	checkApiAccess(state, expression.getNameNode());

	const expType = expression.getType();
	const subExp = expression.getExpression();
	const subExpType = subExp.getType();
	const property = expression.getName();

	if (isArrayMethodType(expType) || (isArrayType(subExpType) && property === "length")) {
		return PropertyCallExpType.Array;
	}

	if (isStringMethodType(expType) || (isStringType(subExpType) && property === "length")) {
		if (STRING_MACRO_METHODS.indexOf(property) !== -1) {
			return PropertyCallExpType.BuiltInStringMethod;
		}
		return PropertyCallExpType.String;
	}

	if (isSetMethodType(expType)) {
		return PropertyCallExpType.Set;
	}

	if (isMapMethodType(expType)) {
		return PropertyCallExpType.Map;
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

		if (subExpTypeName === "ObjectConstructor") {
			return PropertyCallExpType.ObjectConstructor;
		}

		// custom math
		if (RBX_MATH_CLASSES.indexOf(subExpTypeName) !== -1) {
			switch (property) {
				case "add":
					return PropertyCallExpType.RbxMathAdd;
				case "sub":
					return PropertyCallExpType.RbxMathSub;
				case "mul":
					return PropertyCallExpType.RbxMathMul;
				case "div":
					return PropertyCallExpType.RbxMathDiv;
			}
		}
	}

	return PropertyCallExpType.None;
}

export function compilePropertyCallExpression(state: CompilerState, node: ts.CallExpression) {
	const expression = getNonNull(node.getExpression());
	if (!ts.TypeGuards.isPropertyAccessExpression(expression)) {
		throw new CompilerError(
			"Expected PropertyAccessExpression",
			node,
			CompilerErrorType.ExpectedPropertyAccessExpression,
		);
	}

	checkApiAccess(state, expression.getNameNode());

	const subExp = getNonNull(expression.getExpression());
	const property = expression.getName();
	const params = node.getArguments() as Array<ts.Expression>;

	switch (getPropertyAccessExpressionType(state, expression)) {
		case PropertyCallExpType.Array:
			return compilePropertyMethod(state, property, params, subExp, "array", ARRAY_REPLACE_METHODS);
		case PropertyCallExpType.BuiltInStringMethod:
			return `${wrapExpressionIfNeeded(state, subExp)}:${property}(${compileCallArguments(state, params)})`;
		case PropertyCallExpType.String:
			return compilePropertyMethod(state, property, params, subExp, "string", STRING_REPLACE_METHODS);
		case PropertyCallExpType.PromiseThen:
			return `${compileExpression(state, subExp)}:andThen(${compileCallArguments(state, params)})`;
		case PropertyCallExpType.SymbolFor:
			return `${compileExpression(state, subExp)}.getFor(${compileCallArguments(state, params)})`;
		case PropertyCallExpType.Map:
			return compilePropertyMethod(state, property, params, subExp, "map", MAP_REPLACE_METHODS);
		case PropertyCallExpType.Set:
			return compilePropertyMethod(state, property, params, subExp, "set", SET_REPLACE_METHODS);
		case PropertyCallExpType.ObjectConstructor:
			return compilePropertyMethod(state, property, params, subExp, "Object", OBJECT_REPLACE_METHODS);
		case PropertyCallExpType.RbxMathAdd:
			return appendDeclarationIfMissing(
				state,
				node.getParent(),
				`(${compileExpression(state, subExp)} + (${compileCallArgument(state, params[0])}))`,
			);
		case PropertyCallExpType.RbxMathSub:
			return appendDeclarationIfMissing(
				state,
				node.getParent(),
				`(${compileExpression(state, subExp)} - (${compileCallArgument(state, params[0])}))`,
			);
		case PropertyCallExpType.RbxMathMul:
			return appendDeclarationIfMissing(
				state,
				node.getParent(),
				`(${compileExpression(state, subExp)} * (${compileCallArgument(state, params[0])}))`,
			);
		case PropertyCallExpType.RbxMathDiv:
			return appendDeclarationIfMissing(
				state,
				node.getParent(),
				`(${compileExpression(state, subExp)} / (${compileCallArgument(state, params[0])}))`,
			);
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
						} else {
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
						} else {
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

	let accessPath = compileExpression(state, subExp);
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
		throw new CompilerError(
			"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
			node,
			CompilerErrorType.MixedMethodCall,
		);
	}

	return `${accessPath}${sep}${property}(${compileCallArguments(state, params, extraParam)})`;
}
