import * as ts from "ts-morph";
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
	getType,
	isArrayMethodType,
	isConstantExpression,
	isMapMethodType,
	isNullableType,
	isSetMethodType,
	isStringMethodType,
	isTupleReturnTypeCall,
	shouldPushToPrecedingStatement,
	superExpressionClassInheritsFromArray,
	typeConstraint,
} from "../typeUtilities";
import { skipNodesDownwards, skipNodesUpwards } from "../utility";
import { isFunctionExpressionMethod, isMethodDeclaration } from "./function";
import {
	addOneToArrayIndex,
	compileElementAccessBracketExpression,
	compileElementAccessDataTypeExpression,
	getReadableExpressionName,
	isIdentifierDefinedInConst,
	isIdentifierDefinedInExportLet,
} from "./indexed";

const STRING_MACRO_METHODS = ["format", "gmatch", "gsub", "lower", "rep", "reverse", "upper"];

export function shouldWrapExpression(subExp: ts.Node, strict: boolean) {
	subExp = skipNodesDownwards(subExp);
	console.log(subExp.getKindName());
	return (
		!ts.TypeGuards.isIdentifier(subExp) &&
		!ts.TypeGuards.isThisExpression(subExp) &&
		!ts.TypeGuards.isSuperExpression(subExp) &&
		!ts.TypeGuards.isElementAccessExpression(subExp) &&
		(strict ||
			(!ts.TypeGuards.isCallExpression(subExp) &&
				!ts.TypeGuards.isPropertyAccessExpression(subExp) &&
				!ts.TypeGuards.isStringLiteral(subExp) &&
				!ts.TypeGuards.isNewExpression(subExp) &&
				!ts.TypeGuards.isClassExpression(subExp) &&
				!ts.TypeGuards.isNumericLiteral(subExp)))
	);
}

function getLeftHandSideParent(subExp: ts.Node, climb: number = 3) {
	let exp = skipNodesUpwards(subExp);

	for (let i = 0; i < climb; i++) {
		exp = skipNodesUpwards(exp.getParent());
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

function compileCallArgumentsAndSeparateWrapped(
	state: CompilerState,
	params: Array<ts.Expression>,
	strict: boolean = false,
	compile: (state: CompilerState, expression: ts.Expression) => string = compileExpression,
): [string, Array<string>] {
	const [accessPath, ...compiledArgs] = compileCallArguments(state, params, undefined, compile);

	// If we compile to a method call, we might need to wrap in parenthesis
	// We are going to wrap in parenthesis just to be safe,
	// unless it's a CallExpression, Identifier, ElementAccessExpression, or PropertyAccessExpression
	const [subExp] = params;
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

	return [accessStr, compiledArgs];
}

function compileCallArgumentsAndSeparateAndJoinWrapped(
	state: CompilerState,
	params: Array<ts.Expression>,
	strict: boolean = false,
): [string, string] {
	const [accessStr, compiledArgs] = compileCallArgumentsAndSeparateWrapped(state, params, strict);
	return [accessStr, compiledArgs.join(", ")];
}

export function addOneToStringIndex(valueStr: string) {
	if (valueStr === "nil") {
		return "nil";
	}

	if (valueStr.indexOf("e") === -1 && valueStr.indexOf("E") === -1) {
		const valueNumber = Number(valueStr);
		if (!Number.isNaN(valueNumber)) {
			return (valueNumber < 0 ? valueNumber : valueNumber + 1).toString();
		}
	}
	return valueStr + " + 1";
}

function macroStringIndexFunction(
	methodName: string,
	incrementedArgs: Array<number>,
	decrementedArgs: Array<number> = [],
): ReplaceFunction {
	return (state, params) => {
		let i = -1;
		let wasIncrementing: boolean | undefined;
		const [accessPath, compiledArgs] = compileCallArgumentsAndSeparateWrapped(
			state,
			params,
			true,
			(subState, param) => {
				const previousParam = params[i++];
				let incrementing: boolean | undefined;

				if (incrementedArgs.indexOf(i) !== -1) {
					incrementing = true;
				} else if (decrementedArgs.indexOf(i) !== -1) {
					incrementing = false;
				}

				if (
					previousParam &&
					incrementing === wasIncrementing &&
					ts.TypeGuards.isIdentifier(param) &&
					ts.TypeGuards.isIdentifier(previousParam)
				) {
					const definitions = param.getDefinitions().map(def => def.getNode());
					if (previousParam.getDefinitions().every((def, j) => definitions[j] === def.getNode())) {
						wasIncrementing = incrementing;
						return "";
					}
				}

				wasIncrementing = incrementing;
				const expStr = compileExpression(subState, param);

				if (incrementing === undefined) {
					return expStr;
				}

				if (expStr === "nil") {
					return "nil";
				}

				if (expStr.indexOf("e") === -1 && expStr.indexOf("E") === -1) {
					const valueNumber = Number(expStr);
					if (!Number.isNaN(valueNumber)) {
						if (incrementing) {
							return (valueNumber >= 0 ? valueNumber + 1 : valueNumber).toString();
						} else {
							return (valueNumber < 0 ? valueNumber - 1 : valueNumber).toString();
						}
					}
				}

				const currentContext = state.getCurrentPrecedingStatementContext(param);
				const id = currentContext.isPushed ? expStr : state.pushPrecedingStatementToNewId(param, expStr);
				const isNullable = isNullableType(getType(param));
				if (incrementing) {
					currentContext.push(
						state.indent + `if ${isNullable ? `${id} and ` : ""}${id} >= 0 then ${id} = ${id} + 1; end\n`,
					);
				} else {
					currentContext.push(
						state.indent + `if ${isNullable ? `${id} and ` : ""}${id} < 0 then ${id} = ${id} - 1; end\n`,
					);
				}
				return id;
			},
		);
		return `${accessPath}:${methodName}(${compiledArgs
			.map((arg, j, args) => (arg === "" ? args[j - 1] : arg))
			.join(", ")})`;
	};
}

const findMacro = macroStringIndexFunction("find", [2]);

function padAmbiguous(state: CompilerState, params: Array<ts.Expression>) {
	const [strParam, maxLengthParam, fillStringParam] = params;
	let str: string;
	let maxLength: string;
	let fillString: string;

	[str, maxLength, fillString] = compileCallArguments(state, params);

	if (
		!ts.TypeGuards.isStringLiteral(strParam) &&
		(!ts.TypeGuards.isIdentifier(strParam) || isIdentifierDefinedInExportLet(strParam))
	) {
		str = state.pushPrecedingStatementToNewId(strParam, str);
	}

	let fillStringLength: string | undefined;

	if (fillStringParam === undefined) {
		fillString = `(" ")`;
		fillStringLength = "1";
	} else {
		if (isNullableType(getType(fillStringParam))) {
			fillString = `(${fillString} or " ")`;
		} else if (!fillString.match(/^\(*_\d+\)*$/) && shouldWrapExpression(fillStringParam, true)) {
			fillString = `(${fillString})`;
		}

		if (ts.TypeGuards.isStringLiteral(fillStringParam)) {
			fillStringLength = `${fillStringParam.getLiteralText().length}`;
		} else {
			fillStringLength = `#${fillString}`;
		}
	}

	let targetLength: string;
	let repititions: string | undefined;
	let rawRepititions: number | undefined;
	if (ts.TypeGuards.isStringLiteral(strParam)) {
		if (maxLengthParam && ts.TypeGuards.isNumericLiteral(maxLengthParam)) {
			const literalTargetLength = maxLengthParam.getLiteralValue() - strParam.getLiteralText().length;

			if (fillStringParam === undefined || ts.TypeGuards.isStringLiteral(fillStringParam)) {
				rawRepititions = literalTargetLength / (fillStringParam ? fillStringParam.getLiteralText().length : 1);
				repititions = `${Math.ceil(rawRepititions)}`;
			}

			targetLength = `${literalTargetLength}`;
		} else {
			targetLength = `${maxLength} - ${strParam.getLiteralText().length}`;
			if (fillStringLength !== "1") {
				targetLength = state.pushPrecedingStatementToNewId(maxLengthParam, `${targetLength}`);
			}
		}
	} else {
		targetLength = `${maxLength} - #${str}`;
		if (fillStringLength !== "1") {
			targetLength = state.pushPrecedingStatementToNewId(maxLengthParam, `${targetLength}`);
		}
	}

	const doNotTrim =
		(rawRepititions !== undefined && rawRepititions === Math.ceil(rawRepititions)) || fillStringLength === "1";

	return [
		`${fillString}:rep(${repititions ||
			(fillStringLength === "1"
				? targetLength
				: `math.ceil(${targetLength} / ${fillStringLength ? fillStringLength : 1})`)})${
			doNotTrim ? "" : `:sub(1, ${targetLength})`
		}`,
		str,
	];
}

const STRING_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	[
		"size",
		(state, params) => {
			return appendDeclarationIfMissing(
				state,
				getLeftHandSideParent(params[0]),
				`#${compileCallArgumentsAndSeparateAndJoinWrapped(state, params)[0]}`,
			);
		},
	],
	["trim", wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)%s*$")`)],
	["trimLeft", wrapExpFunc(accessPath => `${accessPath}:match("^%s*(.-)$")`)],
	["trimRight", wrapExpFunc(accessPath => `${accessPath}:match("^(.-)%s*$")`)],
	[
		"split",
		(state, params) => {
			const [str, args] = compileCallArgumentsAndSeparateAndJoinWrapped(state, params, true);
			return `string.split(${str}, ${args})`;
		},
	],
	["slice", macroStringIndexFunction("sub", [1], [2])],
	["sub", macroStringIndexFunction("sub", [1, 2])],
	["byte", macroStringIndexFunction("byte", [1, 2])],
	[
		"find",
		(state, params) => {
			state.usesTSLibrary = true;
			return `TS.string_find_wrap(${findMacro(state, params)!})`;
		},
	],
	["match", macroStringIndexFunction("match", [2])],

	[
		"padStart",
		(state, params) =>
			appendDeclarationIfMissing(
				state,
				getLeftHandSideParent(params[0]),
				padAmbiguous(state, params).join(" .. "),
			),
	],

	[
		"padEnd",
		(state, params) => {
			const [a, b] = padAmbiguous(state, params);
			return appendDeclarationIfMissing(state, getLeftHandSideParent(params[0]), [b, a].join(" .. "));
		},
	],
]);

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
		"size",
		(state, params) => {
			return appendDeclarationIfMissing(
				state,
				getLeftHandSideParent(params[0]),
				`#${compileCallArgumentsAndSeparateAndJoinWrapped(state, params)[0]}`,
			);
		},
	],
	[
		"pop",
		(state, params) => {
			const [subExp] = params;
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

	[
		"unorderedRemove",
		(state, params) => {
			const [subExp] = params;
			const node = getLeftHandSideParent(subExp, 2);
			const accessPath = getReadableExpressionName(state, subExp);
			let id: string;

			const len = state.pushPrecedingStatementToReuseableId(subExp, `#${accessPath}`);
			const lastPlace = `${accessPath}[${len}]`;

			const isStatement = getPropertyCallParentIsExpressionStatement(subExp);
			let removingIndex = addOneToArrayIndex(compileCallArguments(state, params.slice(1))[0]);

			if (!isStatement && !isConstantExpression(params[1], 0)) {
				removingIndex = state.pushPrecedingStatementToNewId(subExp, removingIndex);
			}

			const removingPlace = `${accessPath}[${removingIndex}]`;

			if (!isStatement) {
				id = state.pushToDeclarationOrNewId(node, removingPlace);
			}

			const context = state.getCurrentPrecedingStatementContext(subExp);
			const { isPushed } = context;

			state.pushPrecedingStatements(
				subExp,
				state.indent + `${removingPlace} = ${lastPlace}; -- ${subExp.getText()}.unorderedRemove\n`,
			);

			const nullSet = state.indent + `${lastPlace} = nil`;

			if (!isStatement) {
				state.pushPrecedingStatements(subExp, nullSet + ";\n");
			}

			context.isPushed = isPushed;
			return isStatement ? nullSet : id!;
		},
	],

	["shift", (state, params) => `table.remove(${compileExpression(state, params[0])}, 1)`],

	[
		"join",
		(state, params) => {
			const subType = getType(params[0]);
			const arrayType = subType.getArrayElementType();

			if (
				(arrayType
					? arrayType.isUnion()
						? arrayType.getUnionTypes()
						: [arrayType]
					: subType.getTupleElements()
				).every(validType => validType.isNumber() || validType.isString())
			) {
				const argStrs = compileCallArguments(state, params);
				return `table.concat(${argStrs[0]}, ${params[1] ? argStrs[1] : `","`})`;
			}
		},
	],

	[
		"push",
		(state, params) => {
			const [subExp] = params;
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

				if (numParams <= 2) {
					const firstParam = params[1];
					let accessor = `#${accessPath}${firstParam ? " + 1" : ""}`;
					if (isStatement) {
						return firstParam
							? `${accessPath}[${accessor}] = ${compileExpression(state, firstParam)}`
							: `local _ = ${accessor}`;
					} else {
						accessor = state.pushToDeclarationOrNewId(node, accessor);

						if (firstParam) {
							state.pushPrecedingStatements(
								subExp,
								state.indent +
									`${accessPath}[${accessor}] = ${compileExpression(state, firstParam)};\n`,
							);
						}

						return accessor;
					}
				} else {
					state.usesTSLibrary = true;
					return `TS.array_push_stack(${accessPath}, ${compileList(state, params.slice(1)).join(", ")})`;
				}
			}
		},
	],

	[
		"unshift",
		(state, params) => {
			const length = params.length;
			const [subExp] = params;

			if (params.some(param => ts.TypeGuards.isSpreadElement(param))) {
				return undefined;
			}

			let accessPath: string;
			let paramStr: string;
			[accessPath, paramStr] = compileCallArgumentsAndSeparateAndJoin(state, params);
			const isStatement = getPropertyCallParentIsExpressionStatement(subExp);

			if (length === 1) {
				const result = `#${accessPath}`;
				return isStatement ? `local _ = ${result}` : result;
			} else if (length === 2) {
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
			return `table.insert(${accessPath}, ${addOneToArrayIndex(indexParamStr)}, ${valueParamStr})`;
		},
	],

	[
		"remove",
		(state, params) => {
			const [accessPath, indexParamStr] = compileCallArguments(state, params);
			return `table.remove(${accessPath}, ${addOneToArrayIndex(indexParamStr)})`;
		},
	],

	["isEmpty", isMapOrSetOrArrayEmpty],
]);

function getPropertyAccessExpressionRoot(root: ts.Expression) {
	while (ts.TypeGuards.isCallExpression(root)) {
		const exp = root.getExpression();
		if (!ts.TypeGuards.isPropertyAccessExpression(exp)) {
			break;
		}
		root = exp.getExpression();
	}
	return root;
}

function setKeyOfMapOrSet(kind: "map" | "set") {
	const func: ReplaceFunction = (state, params) => {
		const [subExp] = params;
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
	const [subExp] = params;
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

function makeGlobalExpressionMacro(compose: (arg1: string, arg2: string) => string): ReplaceFunction {
	return (state, params) => {
		const [subExp] = params;
		let [obj, type] = compileCallArguments(state, params);

		if (ts.TypeGuards.isSpreadElement(subExp)) {
			const id = state.getNewId();
			type = state.getNewId();

			state.pushPrecedingStatements(subExp, state.indent + `local ${id}, ${type} = ${obj};\n`);
			obj = id;
		}

		const compiledStr = compose(
			obj,
			type,
		);

		return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp, 2), `(${compiledStr})`);
	};
}

const GLOBAL_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	["typeIs", makeGlobalExpressionMacro((obj, type) => `typeof(${obj}) == ${type}`)],
	["classIs", makeGlobalExpressionMacro((obj, className) => `${obj}.ClassName == ${className}`)],
]);

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
		argStrs[i] = compile(state, arg);
		const currentContext = state.exitPrecedingStatementContext();

		if (currentContext.length > 0) {
			lastContextualIndex = i;
			cached[i] = currentContext;
		}
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

export function compileCallArguments(
	state: CompilerState,
	args: Array<ts.Expression>,
	extraParameter?: string,
	compile: (state: CompilerState, expression: ts.Expression) => string = compileExpression,
) {
	let argStrs: Array<string>;

	if (shouldCompileAsSpreadableList(args)) {
		argStrs = [`unpack(${compileSpreadableListAndJoin(state, args, true, compile)})`];
	} else {
		argStrs = compileList(state, args, compile);
	}

	if (extraParameter) {
		argStrs.unshift(extraParameter);
	}

	return argStrs;
}

export function compileCallArgumentsAndJoin(state: CompilerState, args: Array<ts.Expression>, extraParameter?: string) {
	return compileCallArguments(state, args, extraParameter).join(", ");
}

function checkNonImportExpression(exp: ts.LeftHandSideExpression) {
	if (ts.TypeGuards.isImportExpression(exp)) {
		throw new CompilerError(
			"Dynamic import expressions are not supported! Use 'require()' instead and assert the type.",
			exp,
			CompilerErrorType.NoDynamicImport,
		);
	}
	return exp;
}

export function compileCallExpression(
	state: CompilerState,
	node: ts.CallExpression,
	doNotWrapTupleReturn = !isTupleReturnTypeCall(node),
) {
	const exp = skipNodesDownwards(checkNonAny(checkNonImportExpression(node.getExpression())));
	let result: string;

	if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
		result = compilePropertyCallExpression(state, node, exp);
	} else if (ts.TypeGuards.isElementAccessExpression(exp)) {
		result = compileElementAccessCallExpression(state, node, exp);
	} else {
		const params = node.getArguments().map(arg => skipNodesDownwards(arg)) as Array<ts.Expression>;

		if (ts.TypeGuards.isSuperExpression(exp)) {
			if (superExpressionClassInheritsFromArray(exp, false)) {
				if (params.length > 0) {
					throw new CompilerError(
						"Cannot call super() with arguments when extending from Array",
						exp,
						CompilerErrorType.SuperArrayCall,
					);
				}

				return ts.TypeGuards.isExpressionStatement(skipNodesUpwards(node.getParent())) ? "" : "nil";
			} else {
				return `super.constructor(${compileCallArgumentsAndJoin(state, params, "self")})`;
			}
		}

		const isSubstitutableMethod = GLOBAL_REPLACE_METHODS.get(exp.getText());

		if (isSubstitutableMethod) {
			const str = isSubstitutableMethod(state, params);

			if (str) {
				return str;
			}
		}

		if (ts.TypeGuards.isIdentifier(exp)) {
			for (const def of exp.getDefinitions()) {
				const definitionParent = skipNodesUpwards(skipNodesUpwards(def.getNode()).getParent());

				if (
					definitionParent &&
					ts.TypeGuards.isFunctionExpression(definitionParent) &&
					isFunctionExpressionMethod(definitionParent)
				) {
					const alternative =
						"this." + (skipNodesUpwards(definitionParent.getParent()) as ts.PropertyAssignment).getName();
					throw new CompilerError(
						`Cannot call local function expression \`${exp.getText()}\` (this is a foot-gun). Prefer \`${alternative}\``,
						exp,
						CompilerErrorType.BadFunctionExpressionMethodCall,
					);
				}
			}
		}

		let callPath = compileExpression(state, exp);
		if (
			ts.TypeGuards.isBinaryExpression(exp) ||
			ts.TypeGuards.isArrowFunction(exp) ||
			(ts.TypeGuards.isFunctionExpression(exp) && !exp.getNameNode())
		) {
			callPath = `(${callPath})`;
		}
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

	const expType = getType(expression);
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

	const subExp = skipNodesDownwards(expression.getExpression());
	const subExpType = getType(subExp);
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

function getSymbolOrThrow(node: ts.Node, t: ts.Type) {
	const symbol = t.getSymbol();
	if (symbol === undefined) {
		throw new CompilerError(
			`Attempt to call non-method \`${node.getText()}\``,
			node,
			CompilerErrorType.BadMethodCall,
		);
	}
	return symbol;
}

function getMethodCallBacksInfo(node: ts.ElementAccessExpression | ts.PropertyAccessExpression) {
	const type = getType(node);
	const allMethods = typeConstraint(type, t =>
		getSymbolOrThrow(node, t)
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
				if (isMethodDeclaration(dec) || ts.TypeGuards.isMethodSignature(dec)) {
					return true;
				}
				return false;
			}),
	);

	const allCallbacks = typeConstraint(type, t =>
		getSymbolOrThrow(node, t)
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
					(ts.TypeGuards.isFunctionExpression(dec) && !isFunctionExpressionMethod(dec)) ||
					ts.TypeGuards.isArrowFunction(dec) ||
					ts.TypeGuards.isFunctionDeclaration(dec)
				) {
					return true;
				}
				return false;
			}),
	);

	return [allMethods, allCallbacks];
}

export function compileElementAccessCallExpression(
	state: CompilerState,
	node: ts.CallExpression,
	expression: ts.ElementAccessExpression,
) {
	const expExp = skipNodesDownwards(expression.getExpression());
	const accessor = ts.TypeGuards.isSuperExpression(expExp) ? "super" : getReadableExpressionName(state, expExp);

	const accessedPath = compileElementAccessDataTypeExpression(state, expression, accessor)(
		compileElementAccessBracketExpression(state, expression),
	);
	const params = node.getArguments().map(arg => skipNodesDownwards(arg)) as Array<ts.Expression>;
	const [allMethods, allCallbacks] = getMethodCallBacksInfo(expression);

	let paramsStr = compileCallArgumentsAndJoin(state, params);

	if (allMethods && !allCallbacks) {
		paramsStr = paramsStr ? `${accessor}, ` + paramsStr : accessor;
	} else if (!allMethods && allCallbacks) {
		if (ts.TypeGuards.isSuperExpression(expExp)) {
			throw new CompilerError(
				`\`${accessedPath}\` is not a real method! Prefer \`this${accessedPath.slice(5)}\` instead.`,
				expExp,
				CompilerErrorType.BadSuperCall,
			);
		}
	} else {
		// mixed methods and callbacks
		throw new CompilerError(
			"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
			node,
			CompilerErrorType.MixedMethodCall,
		);
	}

	return `${accessedPath}(${paramsStr})`;
}

export function compilePropertyCallExpression(
	state: CompilerState,
	node: ts.CallExpression,
	expression: ts.PropertyAccessExpression,
) {
	checkApiAccess(state, expression.getNameNode());

	const property = expression.getName();
	const params = [
		skipNodesDownwards(expression.getExpression()),
		...node.getArguments().map(arg => skipNodesDownwards(arg)),
	] as Array<ts.Expression>;

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
			return appendDeclarationIfMissing(
				state,
				skipNodesUpwards(node.getParent()),
				`(${argStrs[0]} + ${argStrs[1]})`,
			);
		}
		case PropertyCallExpType.RbxMathSub: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(
				state,
				skipNodesUpwards(node.getParent()),
				`(${argStrs[0]} - ${argStrs[1]})`,
			);
		}
		case PropertyCallExpType.RbxMathMul: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(
				state,
				skipNodesUpwards(node.getParent()),
				`(${argStrs[0]} * ${argStrs[1]})`,
			);
		}
		case PropertyCallExpType.RbxMathDiv: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(
				state,
				skipNodesUpwards(node.getParent()),
				`(${argStrs[0]} / ${argStrs[1]})`,
			);
		}
	}

	const [allMethods, allCallbacks] = getMethodCallBacksInfo(expression);

	let accessedPath: string;
	let paramsStr: string;
	[accessedPath, paramsStr] = compileCallArgumentsAndSeparateAndJoin(state, params);
	let sep: string;
	const [subExp] = params;

	if (allMethods && !allCallbacks) {
		if (ts.TypeGuards.isSuperExpression(subExp)) {
			accessedPath = "super";
			paramsStr = paramsStr ? "self, " + paramsStr : "self";
			sep = ".";
		} else {
			sep = ":";
		}
	} else if (!allMethods && allCallbacks) {
		sep = ".";

		if (ts.TypeGuards.isSuperExpression(subExp)) {
			throw new CompilerError(
				`\`super.${property}\` is not a real method! Prefer \`this.${property}\` instead.`,
				subExp,
				CompilerErrorType.BadSuperCall,
			);
		}
	} else {
		// mixed methods and callbacks
		throw new CompilerError(
			"Attempted to call a function with mixed types! All definitions must either be a method or a callback.",
			node,
			CompilerErrorType.MixedMethodCall,
		);
	}

	if (shouldWrapExpression(subExp, false)) {
		accessedPath = `(${accessedPath})`;
	}

	return `${accessedPath}${sep}${property}(${paramsStr})`;
}
