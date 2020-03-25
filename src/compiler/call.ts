import * as ts from "ts-morph";
import {
	addOneToArrayIndex,
	appendDeclarationIfMissing,
	checkApiAccess,
	checkNonAny,
	compileElementAccessBracketExpression,
	compileElementAccessDataTypeExpression,
	compileExpression,
	compileSpreadableListAndJoin,
	getReadableExpressionName,
	inheritsFromRoact,
	isFunctionExpressionMethod,
	isIdentifierDefinedInConst,
	isIdentifierDefinedInExportLet,
	isMethodDeclaration,
	isValidLuaIdentifier,
	shouldCompileAsSpreadableList,
} from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards, skipNodesUpwards } from "../utility/general";
import {
	getType,
	isArrayMethodType,
	isConstantExpression,
	isFunctionType,
	isMapMethodType,
	isNullableType,
	isSetMethodType,
	isStringMethodType,
	isTupleReturnTypeCall,
	laxTypeConstraint,
	shouldPushToPrecedingStatement,
	superExpressionClassInheritsFromArray,
	isUtf8FunctionType,
} from "../utility/type";
import { getLuaStringLength } from "./template";

export function shouldWrapExpression(subExp: ts.Node, strict: boolean) {
	subExp = skipNodesDownwards(subExp);

	return (
		!ts.TypeGuards.isIdentifier(subExp) &&
		!ts.TypeGuards.isThisExpression(subExp) &&
		!ts.TypeGuards.isSuperExpression(subExp) &&
		!ts.TypeGuards.isElementAccessExpression(subExp) &&
		(strict ||
			(!ts.TypeGuards.isCallExpression(subExp) &&
				!ts.TypeGuards.isPropertyAccessExpression(subExp) &&
				!ts.TypeGuards.isStringLiteral(subExp) &&
				!ts.TypeGuards.isNoSubstitutionTemplateLiteral(subExp) &&
				!ts.TypeGuards.isNewExpression(subExp) &&
				!ts.TypeGuards.isClassExpression(subExp) &&
				!ts.TypeGuards.isNumericLiteral(subExp)))
	);
}

function getLeftHandSideParent(subExp: ts.Node, climb = 3) {
	let exp = skipNodesUpwards(subExp);

	for (let i = 0; i < climb; i++) {
		exp = skipNodesUpwards(exp.getParent()!);
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
	strict = false,
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
	strict = false,
): [string, string] {
	const [accessStr, compiledArgs] = compileCallArgumentsAndSeparateWrapped(state, params, strict);
	return [accessStr, compiledArgs.join(", ")];
}

/** Used to quickly wrap built-in methods which we are going to treat as though the arguments start at 0 instead of 1.
 *
 * This way, strings start at 0, array functions start at 0, etc
 */
function macroIndexFunction(
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

				if (incrementedArgs.includes(i)) {
					incrementing = true;
				} else if (decrementedArgs.includes(i)) {
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

				if (!expStr.includes("e") && !expStr.includes("E")) {
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
						state.indent + `if ${isNullable ? `${id} and ` : ""}${id} >= 0 then ${id} = ${id} + 1; end;\n`,
					);
				} else {
					currentContext.push(
						state.indent + `if ${isNullable ? `${id} and ` : ""}${id} < 0 then ${id} = ${id} - 1; end;\n`,
					);
				}
				return id;
			},
		);
		return `${methodName}(${[accessPath, ...compiledArgs.map((arg, j, args) => arg || args[j - 1])].join(", ")})`;
	};
}

const findMacro = macroIndexFunction("string.find", [2]);

function padAmbiguous(state: CompilerState, params: Array<ts.Expression>) {
	const [strParam, maxLengthParam, fillStringParam] = params as [
		ts.Expression,
		ts.Expression,
		ts.Expression | undefined,
	];
	let str: string;
	let maxLength: string;
	let fillString: string;

	// eslint-disable-next-line prefer-const
	[str, maxLength, fillString] = compileCallArguments(state, params);

	if (
		!ts.TypeGuards.isStringLiteral(strParam) &&
		!ts.TypeGuards.isNoSubstitutionTemplateLiteral(strParam) &&
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

		if (
			ts.TypeGuards.isStringLiteral(fillStringParam) ||
			ts.TypeGuards.isNoSubstitutionTemplateLiteral(fillStringParam)
		) {
			fillStringLength = `${getLuaStringLength(fillStringParam.getLiteralText())}`;
		} else {
			fillStringLength = `#${fillString}`;
		}
	}

	let targetLength: string;
	let repetitions: string | undefined;
	let rawRepetitions: number | undefined;

	if (ts.TypeGuards.isStringLiteral(strParam) || ts.TypeGuards.isNoSubstitutionTemplateLiteral(strParam)) {
		if (maxLengthParam && ts.TypeGuards.isNumericLiteral(maxLengthParam)) {
			const literalTargetLength =
				maxLengthParam.getLiteralValue() - getLuaStringLength(strParam.getLiteralText());

			if (
				fillStringParam === undefined ||
				ts.TypeGuards.isStringLiteral(fillStringParam) ||
				ts.TypeGuards.isNoSubstitutionTemplateLiteral(fillStringParam)
			) {
				rawRepetitions =
					literalTargetLength / (fillStringParam ? getLuaStringLength(fillStringParam.getLiteralText()) : 1);
				repetitions = `${Math.ceil(rawRepetitions)}`;
			}

			targetLength = `${literalTargetLength}`;
		} else {
			targetLength = `${maxLength} - ${getLuaStringLength(strParam.getLiteralText())}`;
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
		(rawRepetitions !== undefined && rawRepetitions === Math.ceil(rawRepetitions)) || fillStringLength === "1";

	const repeatedStr = `string.rep(${fillString}, ${repetitions ||
		(fillStringLength === "1"
			? targetLength
			: `math.ceil(${targetLength} / ${fillStringLength ? fillStringLength : 1})`)})`;

	return [doNotTrim ? repeatedStr : `string.sub(${repeatedStr}, 1, ${targetLength})`, str];
}

const utf8Codepoint = macroIndexFunction("utf8.codepoint", [1, 2]);
const utf8Len = macroIndexFunction("utf8.len", [1, 2]);
const utf8OffsetMacro = macroIndexFunction("utf8.offset", [1, 2]);

const UTF8_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	["codepoint", utf8Codepoint],
	["len", utf8Len],
	[
		"offset",
		(state, params) => {
			const node = getLeftHandSideParent(params[0], 1);

			if (ts.TypeGuards.isNonNullExpression(node.getParent()!)) {
				// don't check non-nil
				return appendDeclarationIfMissing(
					state,
					skipNodesUpwards(node.getParent()!),
					`(${utf8OffsetMacro(state, params)!} - 1)`,
				);
			} else {
				const id = state.pushPrecedingStatementToNewId(params[0], utf8OffsetMacro(state, params)!);

				state.pushPrecedingStatements(
					params[0],
					state.indent + `if ${id} ~= nil then ${id} = ${id} - 1; end;\n`,
				);

				return appendDeclarationIfMissing(state, node, id);
			}
		},
	],
]);

const STRING_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	[
		"size",
		(state, params) =>
			appendDeclarationIfMissing(
				state,
				getLeftHandSideParent(params[0]),
				`#${compileCallArgumentsAndSeparateAndJoinWrapped(state, params, true)[0]}`,
			),
	],
	["trim", wrapExpFunc(accessPath => `string.match(${accessPath}, "^%s*(.-)%s*$")`)],
	["trimStart", wrapExpFunc(accessPath => `string.match(${accessPath}, "^%s*(.-)$")`)],
	["trimEnd", wrapExpFunc(accessPath => `string.match(${accessPath}, "^(.-)%s*$")`)],
	[
		"split",
		(state, params) => {
			const [str, args] = compileCallArgumentsAndSeparateAndJoinWrapped(state, params, true);
			return `string.split(${str}, ${args})`;
		},
	],
	["slice", macroIndexFunction("string.sub", [1], [2])],
	["sub", macroIndexFunction("string.sub", [1, 2])],
	["byte", macroIndexFunction("string.byte", [1, 2])],
	[
		"find",
		(state, params) => {
			state.usesTSLibrary = true;
			return `TS.string_find_wrap(${findMacro(state, params)!})`;
		},
	],
	["match", macroIndexFunction("string.match", [2])],

	[
		"padStart",
		(state, params) =>
			appendDeclarationIfMissing(
				state,
				getLeftHandSideParent(params[0]),
				`(${padAmbiguous(state, params).join(" .. ")})`,
			),
	],

	[
		"padEnd",
		(state, params) => {
			const [a, b] = padAmbiguous(state, params);
			return appendDeclarationIfMissing(state, getLeftHandSideParent(params[0]), `(${[b, a].join(" .. ")})`);
		},
	],

	[
		"indexOf",
		(state, params) => {
			const [accessPath, matchParam, fromIndex] = compileCallArguments(state, params);

			return appendDeclarationIfMissing(
				state,
				getLeftHandSideParent(params[0]),
				`((string.find(${accessPath}, ${matchParam}, ${addOneToArrayIndex(fromIndex ?? "0")}, true) or 0) - 1)`,
			);
		},
	],

	[
		"includes",
		(state, params) => {
			const [accessPath, matchParam, fromIndex] = compileCallArguments(state, params);

			return appendDeclarationIfMissing(
				state,
				getLeftHandSideParent(params[0]),
				`(string.find(${accessPath}, ${matchParam}, ${addOneToArrayIndex(fromIndex ?? "0")}, true) ~= nil)`,
			);
		},
	],
	[
		"startsWith",
		(state, params) => (
			(state.usesTSLibrary = true), `TS.string_startsWith(${compileCallArgumentsAndJoin(state, params)})`
		),
	],
	[
		"endsWith",
		(state, params) => (
			(state.usesTSLibrary = true), `TS.string_endsWith(${compileCallArgumentsAndJoin(state, params)})`
		),
	],
]);

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
				const len = state.pushPrecedingStatementToNewId(subExp, `#${accessPath}`);
				const place = `${accessPath}[${len}]`;
				const nullSet = state.indent + `${place} = nil;\n`;
				const id = state.pushToDeclarationOrNewId(node, place);
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

			const len = state.pushPrecedingStatementToNewId(subExp, `#${accessPath}`);
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

			state.pushPrecedingStatements(subExp, state.indent + `${removingPlace} = ${lastPlace};\n`);

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
			// eslint-disable-next-line prefer-const
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

	[
		"indexOf",
		(state, params) => {
			const [accessPath, indexParamStr, fromIndex] = compileCallArguments(state, params);

			if (fromIndex !== undefined) {
				return `(table.find(${accessPath}, ${indexParamStr}, ${addOneToArrayIndex(fromIndex)}) or 0) - 1`;
			} else {
				return `(table.find(${accessPath}, ${indexParamStr}) or 0) - 1`;
			}
		},
	],

	[
		"includes",
		(state, params) => {
			const [accessPath, indexParamStr, fromIndex] = compileCallArguments(state, params);

			if (fromIndex !== undefined) {
				return `(table.find(${accessPath}, ${indexParamStr}, ${addOneToArrayIndex(fromIndex)}) ~= nil)`;
			} else {
				return `(table.find(${accessPath}, ${indexParamStr}) ~= nil)`;
			}
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
		// eslint-disable-next-line prefer-const
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
		getLeftHandSideParent(params[0], 2),
		`(next(${compileCallArguments(state, params)[0]}) == nil)`,
	),
);

const RBX_MATH_CLASSES = new Set(["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"]);

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

		const compiledStr = compose(obj, type);

		return appendDeclarationIfMissing(state, getLeftHandSideParent(subExp, 2), `(${compiledStr})`);
	};
}

// This makes local testing easier
const PRIMITIVE_LUA_TYPES = new Set(
	["nil", "boolean", "string", "number", "table", "userdata", "function", "thread"].map(v => `"${v}"`),
);

const GLOBAL_REPLACE_METHODS: ReplaceMap = new Map<string, ReplaceFunction>([
	[
		"typeIs",
		makeGlobalExpressionMacro(
			(obj, type) => `${PRIMITIVE_LUA_TYPES.has(type) ? "type" : "typeof"}(${obj}) == ${type}`,
		),
	],
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
				argStrs[i] = state.pushPrecedingStatementToNewId(arg, argStr);
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

export function assertUnquestionable(node: ts.QuestionDotTokenableNode & ts.Node) {
	if (node.hasQuestionDotToken()) {
		throw new CompilerError(
			`You can't use a \`?.\` token with ${node.getText()}`,
			node,
			CompilerErrorType.BadMethodCall,
		);
	}
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
			assertUnquestionable(node);
			if (superExpressionClassInheritsFromArray(exp, false)) {
				if (params.length > 0) {
					throw new CompilerError(
						"Cannot call super() with arguments when extending from Array",
						exp,
						CompilerErrorType.SuperArrayCall,
					);
				}

				return ts.TypeGuards.isExpressionStatement(skipNodesUpwards(node.getParent()!)) ? "" : "nil";
			} else if (inheritsFromRoact(exp.getType())) {
				return "";
			} else {
				return `super.constructor(${compileCallArgumentsAndJoin(state, params, "self")})`;
			}
		}

		const isSubstitutableMethod = GLOBAL_REPLACE_METHODS.get(exp.getText());

		if (isSubstitutableMethod) {
			assertUnquestionable(node);
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
					isFunctionExpressionMethod(definitionParent) &&
					// make sure this is actually inside the definition, since getDefinitions can scope from destructured methods
					node.getFirstAncestor(ancestor => ancestor === definitionParent)
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

		if (node.hasQuestionDotToken()) {
			assertUnquestionable(node);
			const id = ts.TypeGuards.isExpressionStatement(skipNodesUpwards(node.getParent()!))
				? ""
				: state.pushPrecedingStatementToNewId(exp, "");

			callPath = state.pushPrecedingStatementToNewId(exp, callPath);

			// a little code duplication here, but, this is temporary anyway
			result = `${callPath}(${compileCallArgumentsAndJoin(
				state,
				params,
				isDefinedAsMethod(exp) ? "nil" : undefined,
			)})`;

			if (!doNotWrapTupleReturn) {
				result = `{ ${result} }`;
			}

			state.pushPrecedingStatements(exp, state.indent + `if ${callPath} ~= nil then\n`);
			state.pushIndent();
			state.pushPrecedingStatements(exp, state.indent + `${id && id + " = "}${result};\n`);
			state.popIndent();
			state.pushPrecedingStatements(exp, state.indent + `end;\n`);
			return id;
		} else if (
			ts.TypeGuards.isBinaryExpression(exp) ||
			ts.TypeGuards.isArrowFunction(exp) ||
			(ts.TypeGuards.isFunctionExpression(exp) && !exp.getNameNode())
		) {
			callPath = `(${callPath})`;
		}

		result = `${callPath}(${compileCallArgumentsAndJoin(
			state,
			params,
			isDefinedAsMethod(exp) ? "nil" : undefined,
		)})`;
	}

	if (!doNotWrapTupleReturn) {
		result = `{ ${result} }`;
	}

	return result;
}

const compilePropertyMethod = (
	state: CompilerState,
	property: string,
	params: Array<ts.Expression>,
	className: string,
	replaceMethods: ReplaceMap,
	callsite?: string,
) =>
	replaceMethods.get(property)?.(state, params) ||
	`${callsite ?? ((state.usesTSLibrary = true), `TS.${className}_${property}`)}(${compileCallArgumentsAndJoin(
		state,
		params,
	)})`;

export const enum PropertyCallExpType {
	None = -1,
	Array,
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
	Utf8,
}

export function getPropertyAccessExpressionType(
	state: CompilerState,
	expression: ts.PropertyAccessExpression,
): PropertyCallExpType {
	checkApiAccess(state, expression.getNameNode());

	let expType = getType(expression);

	if (expression.hasQuestionDotToken()) {
		expType = expType.getNonNullableType();
	}

	const property = expression.getName();

	if (isArrayMethodType(expType)) {
		return PropertyCallExpType.Array;
	}

	if (isStringMethodType(expType)) {
		return PropertyCallExpType.String;
	}

	if (isUtf8FunctionType(expType)) {
		return PropertyCallExpType.Utf8;
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
		if (RBX_MATH_CLASSES.has(subExpTypeName)) {
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

/** Returns true if it is defined as a method, false if it is defined as a callback, or undefined if neither */
export function isDefinedAsMethod(node: ts.Node): boolean | undefined {
	const type = getType(node).getNonNullableType();

	if (isFunctionType(type)) {
		let hasMethodDefinition = false;
		let hasCallbackDefinition = false;

		// we just use the laxTypeConstraint for easy iteration
		laxTypeConstraint(type, t => {
			for (const declaration of getSymbolOrThrow(node, t).getDeclarations()) {
				if (isMethodDeclaration(declaration)) {
					hasMethodDefinition = true;
				} else {
					hasCallbackDefinition = true;
				}
			}
			return false;
		});

		if (hasMethodDefinition && hasCallbackDefinition) {
			throw new CompilerError(
				"Attempted to define or call a function with mixed types! All definitions must either be a method or a callback.",
				node,
				CompilerErrorType.MixedMethodCall,
			);
		}

		return hasMethodDefinition;
	} else {
		return undefined;
	}
}

export function compileElementAccessCallExpression(
	state: CompilerState,
	node: ts.CallExpression,
	expression: ts.ElementAccessExpression,
) {
	assertUnquestionable(expression);
	const expExp = skipNodesDownwards(expression.getExpression());
	const accessor = ts.TypeGuards.isSuperExpression(expExp) ? "super" : getReadableExpressionName(state, expExp);

	const accessedPath = compileElementAccessDataTypeExpression(
		state,
		expression,
		accessor,
	)(compileElementAccessBracketExpression(state, expression));
	const params = node.getArguments().map(arg => skipNodesDownwards(arg)) as Array<ts.Expression>;
	const isMethod = isDefinedAsMethod(expression)!;

	let paramsStr = compileCallArgumentsAndJoin(state, params);

	if (isMethod) {
		paramsStr = paramsStr ? `${accessor}, ` + paramsStr : accessor;
	} else {
		if (ts.TypeGuards.isSuperExpression(expExp)) {
			throw new CompilerError(
				`\`${accessedPath}\` is not a real method! Prefer \`this${accessedPath.slice(5)}\` instead.`,
				expExp,
				CompilerErrorType.BadSuperCall,
			);
		}
	}

	return `${accessedPath}(${paramsStr})`;
}

export function compilePropertyCallExpression(
	state: CompilerState,
	node: ts.CallExpression,
	expression: ts.PropertyAccessExpression,
) {
	checkApiAccess(state, expression.getNameNode());
	assertUnquestionable(expression);

	let property = expression.getName();
	const params = [
		skipNodesDownwards(expression.getExpression()),
		...node.getArguments().map(arg => skipNodesDownwards(arg)),
	] as Array<ts.Expression>;

	switch (getPropertyAccessExpressionType(state, expression)) {
		case PropertyCallExpType.Array: {
			return compilePropertyMethod(state, property, params, "array", ARRAY_REPLACE_METHODS);
		}
		case PropertyCallExpType.String: {
			return compilePropertyMethod(
				state,
				property,
				params,
				"string",
				STRING_REPLACE_METHODS,
				`string.${property}`,
			);
		}
		case PropertyCallExpType.Utf8: {
			return compilePropertyMethod(
				state,
				property,
				params.slice(1),
				"utf8",
				UTF8_REPLACE_METHODS,
				`utf8.${property}`,
			);
		}
		case PropertyCallExpType.Map: {
			return compilePropertyMethod(state, property, params, "map", MAP_REPLACE_METHODS);
		}
		case PropertyCallExpType.Set: {
			return compilePropertyMethod(state, property, params, "set", SET_REPLACE_METHODS);
		}
		case PropertyCallExpType.ObjectConstructor: {
			return compilePropertyMethod(state, property, params.slice(1), "Object", OBJECT_REPLACE_METHODS);
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
				skipNodesUpwards(node.getParent()!),
				`(${argStrs[0]} + (${argStrs[1]}))`,
			);
		}
		case PropertyCallExpType.RbxMathSub: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(
				state,
				skipNodesUpwards(node.getParent()!),
				`(${argStrs[0]} - (${argStrs[1]}))`,
			);
		}
		case PropertyCallExpType.RbxMathMul: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(
				state,
				skipNodesUpwards(node.getParent()!),
				`(${argStrs[0]} * (${argStrs[1]}))`,
			);
		}
		case PropertyCallExpType.RbxMathDiv: {
			const argStrs = compileCallArguments(state, params);
			return appendDeclarationIfMissing(
				state,
				skipNodesUpwards(node.getParent()!),
				`(${argStrs[0]} / (${argStrs[1]}))`,
			);
		}
	}

	const isMethod = isDefinedAsMethod(expression)!;

	let accessedPath: string;
	let paramsStr: string;
	[accessedPath, paramsStr] = compileCallArgumentsAndSeparateAndJoin(state, params);
	let sep: ":" | ".";
	const [subExp] = params;

	if (isMethod) {
		if (ts.TypeGuards.isSuperExpression(subExp)) {
			accessedPath = "super";
			paramsStr = paramsStr ? "self, " + paramsStr : "self";
			sep = ".";
		} else {
			sep = ":";
		}
	} else {
		sep = ".";

		if (ts.TypeGuards.isSuperExpression(subExp)) {
			throw new CompilerError(
				`\`super.${property}\` is not a real method! Prefer \`this.${property}\` instead.`,
				subExp,
				CompilerErrorType.BadSuperCall,
			);
		}
	}

	if (isValidLuaIdentifier(property)) {
		if (shouldWrapExpression(subExp, false)) {
			accessedPath = `(${accessedPath})`;
		}
		property = sep + property;
	} else {
		if (sep === ":") {
			if (!isValidLuaIdentifier(accessedPath)) {
				accessedPath = state.pushPrecedingStatementToNewId(params[0], accessedPath);
			}

			paramsStr = paramsStr ? accessedPath + ", " + paramsStr : accessedPath;
			property = `["${property}"]`;
		} else {
			if (shouldWrapExpression(subExp, false)) {
				accessedPath = `(${accessedPath})`;
			}
			property = `["${property}"]`;
		}
	}

	return accessedPath + property + "(" + paramsStr + ")";
}
