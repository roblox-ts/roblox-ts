import ts from "ts-morph";
import {
	appendDeclarationIfMissing,
	checkApiAccess,
	checkNonAny,
	compileExpression,
	compileSpreadableListAndJoin,
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
import { getNonNullExpressionDownwards, getNonNullExpressionUpwards } from "../utility";
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

export function shouldWrapExpression(subExp: ts.Node, strict: boolean) {
	return (
		!ts.TypeGuards.isIdentifier(subExp) &&
		!ts.TypeGuards.isElementAccessExpression(subExp) &&
		(strict ||
			(!ts.TypeGuards.isCallExpression(subExp) &&
				!ts.TypeGuards.isPropertyAccessExpression(subExp) &&
				!ts.TypeGuards.isStringLiteral(subExp) &&
				!ts.TypeGuards.isNumericLiteral(subExp)))
	);
}

function getLeftHandSideParent(subExp: ts.Node, climb: number = 3) {
	let exp = subExp;

	for (let i = 0; i < climb; i++) {
		exp = getNonNullExpressionUpwards(exp.getParent());
	}

	return exp;
}

function getPropertyCallParentIsExpressionStatement(subExp: ts.Expression) {
	return ts.TypeGuards.isExpressionStatement(getLeftHandSideParent(subExp));
}

type ReplaceFunction = (state: CompilerState, params: Array<ts.Expression>) => string | undefined;
type ReplaceMap = Map<string, ReplaceFunction>;

function wrapExpFunc(replacer: (accessPath: string) => string): ReplaceFunction {
	return (state, params) => replacer(compileCallArgumentsAndSeparateAndJoinWrapped(state, params, true)[0]);
}

function compileCallArgumentsAndSeparateAndJoin(state: CompilerState, params: Array<ts.Expression>): [string, string] {
	const [accessPath, ...compiledArgs] = compileCallArguments(state, params);
	return [accessPath, compiledArgs.join(", ")];
}

function compileCallArgumentsAndSeparateAndJoinWrapped(
	state: CompilerState,
	params: Array<ts.Expression>,
	strict: boolean = false,
): [string, string] {
	const [accessPath, ...compiledArgs] = compileCallArguments(state, params);

	// If we compile to a method call, we might need to wrap in parenthesis
	// We are going to wrap in parenthesis just to be safe,
	// unless it's a CallExpression, Identifier, ElementAccessExpression, or PropertyAccessExpression
	const subExp = params[0];
	let accessStr: string;
	if (
		!state.getCurrentPrecedingStatementContext(subExp).isPushed &&
		!accessPath.match(/^\(*_\d+\)*$/) &&
		shouldWrapExpression(subExp, strict)
	) {
		accessStr = `(${accessPath})`;
	} else {
		accessStr = accessPath;
	}

	return [accessStr, compiledArgs.join(", ")];
}

const STRING_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>()
	.set("trim", wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)%s*$")`))
	.set("trimLeft", wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)$")`))
	.set("trimRight", wrapExpFunc(accessPath => `${accessPath}:match("^(.-)%s*$")`))
	.set("split", (state, params) => {
		const [str, args] = compileCallArgumentsAndSeparateAndJoinWrapped(state, params, true);
		return `string.split(${str}, ${args})`;
	});

STRING_REPLACE_METHODS.set("trimStart", STRING_REPLACE_METHODS.get("trimLeft")!);
STRING_REPLACE_METHODS.set("trimEnd", STRING_REPLACE_METHODS.get("trimRight")!);

const isMapOrSetOrArrayEmpty: ReplaceFunction = (state, params) =>
	appendDeclarationIfMissing(
		state,
		getLeftHandSideParent(params[0]),
		`(next(${compileExpression(state, params[0])}) == nil)`,
	);

const ARRAY_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	[
		"pop",
		(state, params) => {
			const subExp = params[0];
			const accessPath = getReadableExpressionName(state, subExp);

			if (getPropertyCallParentIsExpressionStatement(subExp)) {
				return `${accessPath}[#${accessPath}] = nil`;
			} else {
				const node = getLeftHandSideParent(subExp, 2);
				let id: string;
				const len = state.pushPrecedingStatementToReuseableId(subExp, `#${accessPath}`);
				const place = `${accessPath}[${len}]`;
				const nullSet = state.indent + `${place} = nil; -- ${subExp.getText()}.pop\n`;
				id = state.pushToDeclarationOrNewId(node, place);
				const context = state.getCurrentPrecedingStatementContext(subExp);
				const { isPushed } = context;
				state.pushPrecedingStatements(subExp, nullSet);
				context.isPushed = isPushed;
				return id;
			}
		},
	],

	["shift", (state, params) => `table.remove(${compileExpression(state, params[0])}, 1)`],

	[
		"join",
		(state, params) => {
			const subExp = params[0];
			const arrayType = subExp.getType().getArrayElementType()!;
			const validTypes = arrayType.isUnion() ? arrayType.getUnionTypes() : [arrayType];

			if (validTypes.every(validType => validType.isNumber() || validType.isString())) {
				const argStrs = compileCallArguments(state, params);
				return `table.concat(${argStrs[0]}, ${params[1] ? argStrs[1] : `","`})`;
			}
		},
	],

	[
		"push",
		(state, params) => {
			const subExp = params[0];
			const isStatement = getPropertyCallParentIsExpressionStatement(subExp);
			const node = getLeftHandSideParent(subExp, 2);
			const { length: numParams } = params;

			if (params.some(param => ts.TypeGuards.isSpreadElement(param))) {
				state.usesTSLibrary = true;
				let arrayStr = compileExpression(state, subExp);
				state.enterPrecedingStatementContext();
				const listStr = compileSpreadableListAndJoin(state, params.slice(1), false);
				const context = state.exitPrecedingStatementContext();

				if (context.length > 0) {
					arrayStr = state.pushPrecedingStatementToNewId(subExp, arrayStr);
					state.pushPrecedingStatements(subExp, ...context);
				}

				return `TS.array_push_apply(${arrayStr}, ${listStr})`;
			} else {
				const accessPath = getReadableExpressionName(state, subExp);
				if (isStatement && numParams === 2) {
					return `${accessPath}[#${accessPath} + 1] = ${compileExpression(state, params[1])}`;
				} else {
					const returnVal = `#${accessPath}${numParams - 1 ? ` + ${numParams - 1}` : ""}`;
					const finalLength = state.pushToDeclarationOrNewId(
						node,
						returnVal,
						declaration => declaration.isIdentifier,
					);

					let lastStatement: string | undefined;

					const commentStr = getLeftHandSideParent(subExp, 1).getText();

					for (let i = 1; i < numParams; i++) {
						const j = numParams - i - 1;

						if (lastStatement) {
							state.pushPrecedingStatements(node, state.indent + lastStatement + `; -- ${commentStr}\n`);
						}

						lastStatement = `${accessPath}[${finalLength}${j ? ` - ${j}` : ""}] = ${compileExpression(
							state,
							params[i],
						)}`;
					}

					if (isStatement) {
						return (
							lastStatement ||
							state
								.getCurrentPrecedingStatementContext(node)
								// just returns finalLength from above
								.pop()!
								// removes ;\n from the back
								.slice(0, -2)
						);
					} else {
						if (lastStatement) {
							state.pushPrecedingStatements(node, state.indent + lastStatement + ";\n");
						}
						return finalLength;
					}
				}
			}
		},
	],

	[
		"unshift",
		(state, params) => {
			const length = params.length;
			const subExp = params[0];

			if (params.some(param => ts.TypeGuards.isSpreadElement(param))) {
				return undefined;
			}

			let accessPath: string;
			let paramStr: string;
			[accessPath, paramStr] = compileCallArgumentsAndSeparateAndJoin(state, params);
			if (length === 1) {
				return `#${accessPath}`;
			} else if (length === 2) {
				const isStatement = getPropertyCallParentIsExpressionStatement(subExp);

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
		(state, params) => {
			const [accessPath, indexParamStr, valueParamStr] = compileCallArguments(state, params);
			return `table.insert(${accessPath}, ${indexParamStr} + 1, ${valueParamStr})`;
		},
	],

	[
		"remove",
		(state, params) => {
			const [accessPath, indexParamStr] = compileCallArguments(state, params);
			return `table.remove(${accessPath}, ${indexParamStr} + 1)`;
		},
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

function setKeyOfMapOrSet(kind: "map" | "set") {
	const func: ReplaceFunction = (state, params) => {
		const subExp = params[0];
		const wasPushed = state.getCurrentPrecedingStatementContext(subExp).isPushed;
		const root: ts.Expression = getPropertyAccessExpressionRoot(subExp);
		let accessStr: string;
		let key: string;
		let value: string;
		[accessStr, key, value] = compileCallArguments(state, params);
		const accessPath = getReadableExpressionName(state, root, accessStr);
		if (kind === "map" && ts.TypeGuards.isSpreadElement(params[1])) {
			const newKey = state.getNewId();
			value = state.getNewId();

			state.pushPrecedingStatements(subExp, state.indent + `local ${newKey}, ${value} = ${key};\n`);
			key = newKey;
		}
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

	return func;
}

const hasKeyOfMapOrSet: ReplaceFunction = (state, params) => {
	const [accessPath, key] = compileCallArgumentsAndSeparateAndJoinWrapped(state, params);
	return appendDeclarationIfMissing(state, getLeftHandSideParent(params[0]), `(${accessPath}[${key}] ~= nil)`);
};

const deleteKeyOfMapOrSet: ReplaceFunction = (state, params) => {
	const [accessPath, key] = compileCallArguments(state, params);
	const expStr = `${accessPath}[${key}] = nil`;
	const subExp = params[0];
	if (getPropertyCallParentIsExpressionStatement(subExp)) {
		return expStr;
	} else {
		const node = getLeftHandSideParent(subExp, 2);
		const id = state.pushToDeclarationOrNewId(node, `${accessPath}[${key}] ~= nil`);
		state.pushPrecedingStatements(subExp, state.indent + expStr + `;\n`);
		state.getCurrentPrecedingStatementContext(subExp).isPushed = true;
		return id;
	}
};

const MAP_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	["set", setKeyOfMapOrSet("map")],
	["delete", deleteKeyOfMapOrSet],
	["has", hasKeyOfMapOrSet],
	["isEmpty", isMapOrSetOrArrayEmpty],
	[
		"get",
		(state, params) => {
			const [accessPath, key] = compileCallArgumentsAndSeparateAndJoinWrapped(state, params);
			return appendDeclarationIfMissing(state, getLeftHandSideParent(params[0]), `${accessPath}[${key}]`);
		},
	],
]);

const SET_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	["add", setKeyOfMapOrSet("set")],
	["delete", deleteKeyOfMapOrSet],
	["has", hasKeyOfMapOrSet],
	["isEmpty", isMapOrSetOrArrayEmpty],
]);

const OBJECT_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>().set("isEmpty", (state, params) =>
	appendDeclarationIfMissing(
		state,
		getLeftHandSideParent(params[0]),
		`(next(${compileCallArguments(state, params)[1]}) == nil)`,
	),
);

const RBX_MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];

const GLOBAL_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>().set("typeIs", (state, params) => {
	const subExp = params[0];
	let [obj, type] = compileCallArguments(state, params);

	if (ts.TypeGuards.isSpreadElement(subExp)) {
		const id = state.getNewId();
		type = state.getNewId();

		state.pushPrecedingStatements(subExp, state.indent + `local ${id}, ${type} = ${obj};\n`);
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
		argStrs = [`unpack(${compileSpreadableListAndJoin(state, args)})`];
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
			const str = isSubstitutableMethod(state, params);

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
	className: string,
	replaceMethods: ReplaceMap,
) {
	const isSubstitutableMethod = replaceMethods.get(property);

	if (isSubstitutableMethod) {
		const str = isSubstitutableMethod(state, params);
		if (str) {
			return str;
		}
	}

	if (className === "Object") {
		params = params.slice(1);
	}
	state.usesTSLibrary = true;
	return `TS.${className}_${property}(${compileCallArgumentsAndJoin(state, params)})`;
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
	const property = expression.getName();

	if (isArrayMethodType(expType)) {
		return PropertyCallExpType.Array;
	}

	if (isStringMethodType(expType)) {
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

	const subExp = expression.getExpression();
	const subExpType = subExp.getType();
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
	const expression = getNonNullExpressionDownwards(node.getExpression());
	if (!ts.TypeGuards.isPropertyAccessExpression(expression)) {
		throw new CompilerError(
			"Expected PropertyAccessExpression",
			node,
			CompilerErrorType.ExpectedPropertyAccessExpression,
		);
	}

	checkApiAccess(state, expression.getNameNode());

	const property = expression.getName();
	const params = [getNonNullExpressionDownwards(expression.getExpression()), ...node.getArguments()] as Array<
		ts.Expression
	>;

	switch (getPropertyAccessExpressionType(state, expression)) {
		case PropertyCallExpType.Array: {
			return compilePropertyMethod(state, property, params, "array", ARRAY_REPLACE_METHODS);
		}
		case PropertyCallExpType.String: {
			return compilePropertyMethod(state, property, params, "string", STRING_REPLACE_METHODS);
		}
		case PropertyCallExpType.Map: {
			return compilePropertyMethod(state, property, params, "map", MAP_REPLACE_METHODS);
		}
		case PropertyCallExpType.Set: {
			return compilePropertyMethod(state, property, params, "set", SET_REPLACE_METHODS);
		}
		case PropertyCallExpType.ObjectConstructor: {
			return compilePropertyMethod(state, property, params, "Object", OBJECT_REPLACE_METHODS);
		}
		case PropertyCallExpType.BuiltInStringMethod: {
			const [accessPath, compiledArgs] = compileCallArgumentsAndSeparateAndJoinWrapped(state, params, true);
			return `${accessPath}:${property}(${compiledArgs})`;
		}
		case PropertyCallExpType.PromiseThen: {
			const [accessPath, compiledArgs] = compileCallArgumentsAndSeparateAndJoin(state, params);
			return `${accessPath}:andThen(${compiledArgs})`;
		}
		case PropertyCallExpType.SymbolFor: {
			const [accessPath, compiledArgs] = compileCallArgumentsAndSeparateAndJoin(state, params);
			return `${accessPath}.getFor(${compiledArgs})`;
		}
		case PropertyCallExpType.RbxMathAdd: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(state, node.getParent(), `(${argStrs[0]} + (${argStrs[1]}))`);
		}
		case PropertyCallExpType.RbxMathSub: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(state, node.getParent(), `(${argStrs[0]} - (${argStrs[1]}))`);
		}
		case PropertyCallExpType.RbxMathMul: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(state, node.getParent(), `(${argStrs[0]} * (${argStrs[1]}))`);
		}
		case PropertyCallExpType.RbxMathDiv: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(state, node.getParent(), `(${argStrs[0]} / (${argStrs[1]}))`);
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

	let accessedPath: string;
	let paramsStr: string;
	[accessedPath, paramsStr] = compileCallArgumentsAndSeparateAndJoin(state, params);
	let sep: string;
	if (allMethods && !allCallbacks) {
		if (ts.TypeGuards.isSuperExpression(params[0])) {
			accessedPath = "super.__index";
			paramsStr = paramsStr ? "self, " + paramsStr : "self";
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

	return `${accessedPath}${sep}${property}(${paramsStr})`;
}
