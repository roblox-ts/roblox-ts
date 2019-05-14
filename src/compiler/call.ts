import * as ts from "ts-morph";
import {
	appendDeclarationIfMissing,
	checkApiAccess,
	checkNonAny,
	compileExpression,
	compileSpreadableList,
	shouldCompileAsSpreadableList,
} from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	isArrayMethodType,
	isMapMethodType,
	isSetMethodType,
	isStringMethodType,
	isTupleReturnTypeCall,
	shouldPushToPrecedingStatement,
	typeConstraint,
} from "../typeUtilities";
import { getNonNullExpression } from "../utility";
import { getReadableExpressionName, isIdentifierDefinedInConst } from "./indexed";

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

	if (
		!state.getCurrentPrecedingStatementContext(subExp).isPushed &&
		!accessPath.match(/^_\d+$/) &&
		shouldWrapExpression(subExp, strict)
	) {
		return `(${accessPath})`;
	} else {
		return accessPath;
	}
}

function getLeftHandSideParent(subExp: ts.Node, climb: number = 3) {
	let exp = subExp;

	for (let i = 0; i < climb; i++) {
		exp = exp.getParent();
	}

	return exp;
}

function getPropertyCallParentIsExpressionStatement(subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>) {
	return ts.TypeGuards.isExpressionStatement(getLeftHandSideParent(subExp));
}

type SimpleReplaceFunction = (
	accessPath: string,
	params: Array<ts.Expression>,
	state: CompilerState,
	subExp: ts.LeftHandSideExpression<ts.ts.LeftHandSideExpression>,
) => string | undefined;

type ReplaceFunction = (
	params: Array<ts.Expression>,
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
		return `string.split(${wrapExpressionIfNeeded(state, subExp)}, ${compileCallArguments(state, params)[0]})`;
	});

STRING_REPLACE_METHODS.set("trimStart", STRING_REPLACE_METHODS.get("trimLeft")!);
STRING_REPLACE_METHODS.set("trimEnd", STRING_REPLACE_METHODS.get("trimRight")!);

const isMapOrSetOrArrayEmpty: ReplaceFunction = (params, state, subExp) =>
	appendDeclarationIfMissing(
		state,
		getLeftHandSideParent(subExp),
		`(next(${compileExpression(state, subExp)}) == nil)`,
	);

// const accessPath = compileExpression(state, subExp);
// const [key] = compileCallArguments(state, params);
// const expStr = `${accessPath}[${key}] = nil`;
// if (getPropertyCallParentIsExpressionStatement(subExp)) {
// 			return expStr;
// 		} else {
// 			const [id] = state.pushPrecedingStatementToNewIds(subExp, `${accessPath}[${key}] ~= nil`, 1);
// 			state.pushPrecedingStatements(subExp, state.indent + expStr + `;\n`);
// 			state.getCurrentPrecedingStatementContext(subExp).isPushed = true;
// 			return id;
// 		}

const ARRAY_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	[
		"pop",
		(params, state, subExp) => {
			const accessPath = getReadableExpressionName(state, subExp, compileExpression(state, subExp));
			if (getPropertyCallParentIsExpressionStatement(subExp)) {
				return `${accessPath}[#${accessPath}] = nil`;
			} else {
				const node = getLeftHandSideParent(subExp, 2);
				let id: string;
				const len = state.pushPrecedingStatementToReuseableId(subExp, `#${accessPath}`);
				const place = `${accessPath}[${len}]`;
				const nullSet = state.indent + `${place} = nil; -- ${subExp.getText()}.pop\n`;
				id = state.pushToDeclarationOrNewId(node, place);
				state.pushPrecedingStatements(subExp, nullSet);
				return id;
			}
		},
	],

	["shift", accessPathWrap(accessPath => `table.remove(${accessPath}, 1)`)],

	[
		"join",
		(params, state, subExp) => {
			const arrayType = subExp.getType().getArrayType()!;
			const validTypes = arrayType.isUnion() ? arrayType.getUnionTypes() : [arrayType];

			if (validTypes.every(validType => validType.isNumber() || validType.isString())) {
				const paramStr = params[0] ? compileCallArguments(state, params)[0] : `","`;
				const accessPath = compileExpression(state, subExp);
				return `table.concat(${accessPath}, ${paramStr})`;
			}
		},
	],

	[
		"push",
		(params, state, subExp) => {
			const isStatement = getPropertyCallParentIsExpressionStatement(subExp);
			const node = getLeftHandSideParent(subExp, 2);

			if (params.some(param => ts.TypeGuards.isSpreadElement(param))) {
				return `TS.array_push(${compileExpression(state, subExp)}, ${compileSpreadableList(state, params)})`;
			} else {
			}

			const parameterStrs = compileCallArguments(state, params);
			const accessPath = getReadableExpressionName(state, subExp, compileExpression(state, subExp));
			const { length: numParams } = parameterStrs;

			if (isStatement && numParams === 1) {
				return `${accessPath}[#${accessPath} + 1] = ${parameterStrs}`;
			} else {
				const returnVal = `#${accessPath}${numParams ? ` + ${numParams}` : ""}`;
				const finalLength = state.pushToDeclarationOrNewId(
					node,
					returnVal,
					declaration => declaration.isIdentifier,
				);

				let lastStatement: string | undefined;

				for (let i = 0; i < numParams; i++) {
					const j = numParams - i - 1;

					if (lastStatement) {
						state.pushPrecedingStatements(
							node,
							state.indent + lastStatement + `; -- ${subExp.getParent().getText()}\n`,
						);
					}

					lastStatement = `${accessPath}[${finalLength}${j ? ` - ${j}` : ""}] = ${parameterStrs[i]}`;
				}

				if (isStatement) {
					return lastStatement;
				} else {
					if (lastStatement) {
						state.pushPrecedingStatements(node, state.indent + lastStatement + ";\n");
					}
					return finalLength;
				}
			}
		},
	],

	[
		"unshift",
		(params, state, subExp) => {
			const length = params.length;
			let accessPath = compileExpression(state, subExp);
			if (length === 0) {
				return `#${accessPath}`;
			} else if (length === 1) {
				const isStatement = getPropertyCallParentIsExpressionStatement(subExp);
				const [paramStr] = compileCallArguments(state, params);

				if (isStatement) {
					const expStr = `table.insert(${accessPath}, 1, ${paramStr})`;
					return expStr;
				} else {
					accessPath = getReadableExpressionName(state, subExp, accessPath);
					state.pushPrecedingStatements(
						subExp,
						state.indent + `table.insert(${accessPath}, 1, ${paramStr});\n`,
					);
					return `#${accessPath}`;
				}
			}
		},
	],

	[
		"insert",
		accessPathWrap((accessPath, params, state) => {
			const [indexParamStr, valueParamStr] = compileCallArguments(state, params);
			return `table.insert(${accessPath}, ${indexParamStr} + 1, ${valueParamStr})`;
		}),
	],

	[
		"remove",
		accessPathWrap((accessPath, params, state) => {
			const [indexParamStr] = compileCallArguments(state, params);
			return `table.remove(${accessPath}, ${indexParamStr} + 1)`;
		}),
	],

	["isEmpty", isMapOrSetOrArrayEmpty],
]);

function getPropertyAccessExpressionRoot(root: ts.Expression) {
	while (ts.TypeGuards.isCallExpression(root)) {
		const exp = root.getExpression();
		if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
			root = exp.getExpression();
		}
	}
	return root;
}

const setKeyOfMapOrSet: ReplaceFunction = (params, state, subExp) => {
	const wasPushed = state.getCurrentPrecedingStatementContext(subExp).isPushed;
	const root: ts.Expression = getPropertyAccessExpressionRoot(subExp);
	const accessPath = getReadableExpressionName(state, root, compileExpression(state, subExp));
	const [key, value] = compileCallArguments(state, params);
	const expStr = `${accessPath}[${key}] = ${value || "true"}`;

	if (getPropertyCallParentIsExpressionStatement(subExp)) {
		return expStr;
	} else {
		const isPushed =
			wasPushed ||
			ts.TypeGuards.isNewExpression(root) ||
			(ts.TypeGuards.isIdentifier(root) && isIdentifierDefinedInConst(root));

		state.pushPrecedingStatements(subExp, state.indent + expStr + `;\n`);
		state.getCurrentPrecedingStatementContext(subExp).isPushed = isPushed;

		return accessPath;
	}
};

const hasKeyOfMapOrSet: ReplaceFunction = (params, state, subExp) => {
	const accessPath = wrapExpressionIfNeeded(state, subExp, true);
	const [key] = compileCallArguments(state, params);
	return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp), `(${accessPath}[${key}] ~= nil)`);
};

const deleteKeyOfMapOrSet: ReplaceFunction = (params, state, subExp) => {
	const accessPath = compileExpression(state, subExp);
	const [key] = compileCallArguments(state, params);
	const expStr = `${accessPath}[${key}] = nil`;
	if (getPropertyCallParentIsExpressionStatement(subExp)) {
		return expStr;
	} else {
		const id = state.pushPrecedingStatementToNewId(subExp, `${accessPath}[${key}] ~= nil`);
		state.pushPrecedingStatements(subExp, state.indent + expStr + `;\n`);
		state.getCurrentPrecedingStatementContext(subExp).isPushed = true;
		return id;
	}
};

const MAP_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	["set", setKeyOfMapOrSet],
	["delete", deleteKeyOfMapOrSet],
	["has", hasKeyOfMapOrSet],
	["isEmpty", isMapOrSetOrArrayEmpty],
	[
		"get",
		(params, state, subExp) => {
			const accessPath = wrapExpressionIfNeeded(state, subExp, true);
			const [key] = compileCallArguments(state, params);
			return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp), `${accessPath}[${key}]`);
		},
	],
]);

const SET_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	["add", setKeyOfMapOrSet],
	["delete", deleteKeyOfMapOrSet],
	["has", hasKeyOfMapOrSet],
	["isEmpty", isMapOrSetOrArrayEmpty],
]);

const OBJECT_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>().set("isEmpty", (params, state, subExp) =>
	appendDeclarationIfMissing(
		state,
		getLeftHandSideParent(subExp),
		`(next(${compileCallArguments(state, params)[0]}) == nil)`,
	),
);

const RBX_MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];

const GLOBAL_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>().set("typeIs", (params, state, subExp) => {
	let [obj, type] = compileCallArguments(state, params);

	if (!type) {
		const id = state.getNewId();
		type = state.getNewId();

		state.pushPrecedingStatements(subExp, state.indent + `local ${id}, ${type} = ${obj}`);
		obj = id;
	}

	return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp, 2), `(typeof(${obj}) == ${type})`);
});

export function compileList(
	state: CompilerState,
	args: Array<ts.Expression>,
	compile: (state: CompilerState, expression: ts.Expression) => string = compileExpression,
) {
	const argStrs = new Array<string>();
	let lastContextualIndex: number | undefined;
	const cached = new Array<PrecedingStatementContext>();

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (!ts.TypeGuards.isSpreadElement(arg)) {
			checkNonAny(arg);
		}

		state.enterPrecedingStatementContext();
		const expStr = compile(state, arg);

		const currentContext = state.exitPrecedingStatementContext();

		if (currentContext.length > 0) {
			lastContextualIndex = i;
			cached[i] = currentContext;
		}

		argStrs[i] = expStr;
	}

	if (lastContextualIndex !== undefined) {
		for (let i = 0; i < lastContextualIndex; i++) {
			const arg = args[i];
			const argStr = argStrs[i];
			const cachedStrs = cached[i];

			if (cachedStrs) {
				state.pushPrecedingStatements(arg, ...cachedStrs);
			}

			if (shouldPushToPrecedingStatement(arg, argStr, cachedStrs || [])) {
				argStrs[i] = state.pushPrecedingStatementToReuseableId(arg, argStr, cached[i + 1]);
			}
		}

		state.pushPrecedingStatements(args[lastContextualIndex], ...cached[lastContextualIndex]);
	}

	return argStrs;
}

export function compileCallArguments(state: CompilerState, args: Array<ts.Expression>, extraParameter?: string) {
	let argStrs: Array<string>;

	if (shouldCompileAsSpreadableList(args)) {
		argStrs = [`unpack(${compileSpreadableList(state, args)})`];
	} else {
		argStrs = compileList(state, args);
	}

	if (extraParameter) {
		argStrs.unshift(extraParameter);
	}

	return argStrs;
}

export function compileCallArgumentsAndJoin(state: CompilerState, args: Array<ts.Expression>, extraParameter?: string) {
	return compileCallArguments(state, args, extraParameter).join(", ");
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
			return `super.constructor(${compileCallArgumentsAndJoin(state, params, "self")})`;
		}

		const isSubstitutableMethod = GLOBAL_REPLACE_METHODS.get(exp.getText());

		if (isSubstitutableMethod) {
			const str = isSubstitutableMethod(params, state, exp);

			if (str) {
				return str;
			}
		}

		const callPath = compileExpression(state, exp);
		result = `${callPath}(${compileCallArgumentsAndJoin(state, params)})`;
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
	return `TS.${className}_${property}(${compileCallArgumentsAndJoin(state, params, accessPath)})`;
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

	if (isArrayMethodType(expType)) {
		return PropertyCallExpType.Array;
	}

	if (isStringMethodType(subExpType)) {
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
	const expression = getNonNullExpression(node.getExpression());
	if (!ts.TypeGuards.isPropertyAccessExpression(expression)) {
		throw new CompilerError(
			"Expected PropertyAccessExpression",
			node,
			CompilerErrorType.ExpectedPropertyAccessExpression,
		);
	}

	checkApiAccess(state, expression.getNameNode());

	const subExp = getNonNullExpression(expression.getExpression());
	const property = expression.getName();
	const params = node.getArguments() as Array<ts.Expression>;

	switch (getPropertyAccessExpressionType(state, expression)) {
		case PropertyCallExpType.Array:
			return compilePropertyMethod(state, property, params, subExp, "array", ARRAY_REPLACE_METHODS);
		case PropertyCallExpType.BuiltInStringMethod:
			return `${wrapExpressionIfNeeded(state, subExp)}:${property}(${compileCallArgumentsAndJoin(
				state,
				params,
			)})`;
		case PropertyCallExpType.String:
			return compilePropertyMethod(state, property, params, subExp, "string", STRING_REPLACE_METHODS);
		case PropertyCallExpType.PromiseThen:
			return `${compileExpression(state, subExp)}:andThen(${compileCallArgumentsAndJoin(state, params)})`;
		case PropertyCallExpType.SymbolFor:
			return `${compileExpression(state, subExp)}.getFor(${compileCallArgumentsAndJoin(state, params)})`;
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
				`(${compileExpression(state, subExp)} + (${compileCallArguments(state, params)[0]}))`,
			);
		case PropertyCallExpType.RbxMathSub:
			return appendDeclarationIfMissing(
				state,
				node.getParent(),
				`(${compileExpression(state, subExp)} - (${compileCallArguments(state, params)[0]}))`,
			);
		case PropertyCallExpType.RbxMathMul:
			return appendDeclarationIfMissing(
				state,
				node.getParent(),
				`(${compileExpression(state, subExp)} * (${compileCallArguments(state, params)[0]}))`,
			);
		case PropertyCallExpType.RbxMathDiv:
			return appendDeclarationIfMissing(
				state,
				node.getParent(),
				`(${compileExpression(state, subExp)} / (${compileCallArguments(state, params)[0]}))`,
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

	return `${accessPath}${sep}${property}(${compileCallArgumentsAndJoin(state, params, extraParam)})`;
}
