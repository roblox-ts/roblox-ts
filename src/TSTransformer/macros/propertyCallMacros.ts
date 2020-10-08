import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { offset } from "TSTransformer/util/offset";
import { isNumberType, isPossiblyType, isStringType } from "TSTransformer/util/types";

function runtimeLib(name: string, isStatic = false): PropertyCallMacro {
	return (state, node, expression, args) => {
		if (!isStatic) {
			args.unshift(expression);
		}
		return luau.call(state.TS(name), args);
	};
}

function makeMathMethod(operator: luau.BinaryOperator): PropertyCallMacro {
	return (state, node, expression, args) => luau.binary(expression, operator, args[0]);
}

const OPERATOR_TO_NAME_MAP = new Map<luau.BinaryOperator, "add" | "sub" | "mul" | "div">([
	["+", "add"],
	["-", "sub"],
	["*", "mul"],
	["/", "div"],
]);

function makeMathSet(...operators: Array<luau.BinaryOperator>) {
	const result: { [index: string]: PropertyCallMacro } = {};
	for (const operator of operators) {
		const methodName = OPERATOR_TO_NAME_MAP.get(operator);
		assert(methodName);
		result[methodName] = makeMathMethod(operator);
	}
	return result;
}

function offsetArguments(args: Array<luau.Expression>, argOffsets: Array<number>) {
	const minLength = Math.min(args.length, argOffsets.length);
	for (let i = 0; i < minLength; i++) {
		const offsetValue = argOffsets[i];
		if (offsetValue !== 0) {
			const arg = args[i];
			if (luau.isNumberLiteral(arg)) {
				args[i] = luau.number(Number(arg.value) + offsetValue);
			} else {
				args[i] = offset(arg, offsetValue);
			}
		}
	}
	return args;
}

function makeStringCallback(
	strCallback: luau.PropertyAccessExpression,
	argOffsets: Array<number> = [],
): PropertyCallMacro {
	return (state, node, expression, args) => {
		return luau.call(strCallback, [expression, ...offsetArguments(args, argOffsets)]);
	};
}

function makeFindMethod(initialValue: luau.Expression, returnValue: boolean): PropertyCallMacro {
	return (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(args[0]);
		const loopId = luau.tempId();
		const valueId = luau.tempId();
		const returnId = state.pushToVar(initialValue);

		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				expression: luau.call(luau.globals.ipairs, [expression]),
				ids: luau.list.make(loopId, valueId),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.create(luau.SyntaxKind.BinaryExpression, {
							left: luau.call(callbackId, [valueId, offset(loopId, -1), expression]),
							operator: "==",
							right: luau.bool(true),
						}),
						statements: luau.list.make<luau.Statement>(
							luau.create(luau.SyntaxKind.Assignment, {
								left: returnId,
								operator: "=",
								right: returnValue ? valueId : offset(loopId, -1),
							}),
							luau.create(luau.SyntaxKind.BreakStatement, {}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return returnId;
	};
}

function createReduceMethod(
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	args: Array<luau.Expression>,
	start: luau.Expression,
	end: luau.Expression,
	step: number,
): luau.Expression {
	const lengthExp = luau.unary("#", expression);

	let resultId;
	// if there was no initialValue supplied
	if (args.length < 2) {
		state.prereq(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.binary(lengthExp, "==", luau.number(0)),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(luau.globals.error, [
							luau.string(
								"Attempted to call `ReadonlyArray.reduce()` on an empty array without an initialValue.",
							),
						]),
					}),
				),
				elseBody: luau.list.make(),
			}),
		);
		resultId = state.pushToVar(
			luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(expression),
				index: start,
			}),
		);
		start = offset(start, step);
	} else {
		resultId = state.pushToVar(args[1]);
	}
	const callbackId = state.pushToVar(args[0]);

	const iteratorId = luau.tempId();
	state.prereq(
		luau.create(luau.SyntaxKind.NumericForStatement, {
			id: iteratorId,
			start,
			end,
			step: step === 1 ? undefined : luau.number(step),
			statements: luau.list.make(
				luau.create(luau.SyntaxKind.Assignment, {
					left: resultId,
					operator: "=",
					right: luau.call(callbackId, [
						resultId,
						luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: iteratorId,
						}),
						offset(iteratorId, -1),
						expression,
					]),
				}),
			),
		}),
	);

	return resultId;
}

const size: PropertyCallMacro = (state, node, expression) => luau.unary("#", expression);

function stringMatchCallback(pattern: string): PropertyCallMacro {
	return (state, node, expression) => luau.call(luau.globals.string.match, [expression, luau.string(pattern)]);
}

function makeCopyMethod(iterator: luau.Identifier, makeExpression: PropertyCallMacro): PropertyCallMacro {
	return (state, node, expression, args) => {
		const arrayCopyId = state.pushToVar(luau.map());
		const valueId = luau.tempId();
		const keyId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(iterator, [makeExpression(state, node, expression, args)]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: arrayCopyId,
							index: keyId,
						}),
						operator: "=",
						right: valueId,
					}),
				),
			}),
		);

		return arrayCopyId;
	};
}

const findMacro = makeStringCallback(luau.globals.string.find, [0, 1]);
const findStringOccurenceMacro: PropertyCallMacro = (state, node, expression, args) =>
	luau.call(luau.globals.string.find, [
		expression, // base string
		args[0], // search string
		offset(args[1] ?? luau.number(0), 1),
		luau.bool(true),
	]);

const STRING_CALLBACKS: MacroList<PropertyCallMacro> = {
	size,

	byte: makeStringCallback(luau.globals.string.byte, [1, 0]),
	format: makeStringCallback(luau.globals.string.format),
	gmatch: makeStringCallback(luau.globals.string.gmatch),
	gsub: makeStringCallback(luau.globals.string.gsub),
	lower: makeStringCallback(luau.globals.string.lower),
	match: makeStringCallback(luau.globals.string.match),
	rep: makeStringCallback(luau.globals.string.rep),
	reverse: makeStringCallback(luau.globals.string.reverse),
	slice: makeStringCallback(luau.globals.string.sub, [1, 0]),
	split: makeStringCallback(luau.globals.string.split),
	sub: makeStringCallback(luau.globals.string.sub, [1, 1]),
	upper: makeStringCallback(luau.globals.string.upper),

	trim: stringMatchCallback("^%s*(.-)%s*$"),
	trimStart: stringMatchCallback("^%s*(.-)$"),
	trimEnd: stringMatchCallback("^(.-)%s*$"),

	find: (state, node, expression, args) =>
		luau.call(state.TS("string_find_wrap"), [findMacro(state, node, expression, args)]),
	includes: (state, node, expression, args) =>
		luau.create(luau.SyntaxKind.BinaryExpression, {
			left: findStringOccurenceMacro(state, node, expression, args),
			operator: "~=",
			right: luau.nil(),
		}),
	indexOf: (state, node, expression, args) => {
		// pushToVar to avoid LuaTuple unpacking into the usage of the result
		const result = state.pushToVar(findStringOccurenceMacro(state, node, expression, args));
		return luau.binary(
			luau.binary(luau.binary(result, "~=", luau.nil()), "and", offset(result, -1)),
			"or",
			luau.number(-1),
		);
	},
};

function makeEveryOrSomeMethod(
	iterator: luau.Identifier,
	callbackArgsListMaker: (
		keyId: luau.TemporaryIdentifier,
		valueId: luau.TemporaryIdentifier,
		expression: luau.Expression,
	) => Array<luau.Expression>,
	initialState: boolean,
): PropertyCallMacro {
	return (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(luau.bool(initialState));
		const callbackId = state.pushToVarIfComplex(args[0]);

		const keyId = luau.tempId();
		const valueId = luau.tempId();

		const callCallback = luau.call(callbackId, callbackArgsListMaker(keyId, valueId, expression));
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(iterator, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: initialState ? luau.unary("not", callCallback) : callCallback,
						statements: luau.list.make<luau.Statement>(
							luau.create(luau.SyntaxKind.Assignment, {
								left: resultId,
								operator: "=",
								right: luau.bool(!initialState),
							}),
							luau.create(luau.SyntaxKind.BreakStatement, {}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return resultId;
	};
}

function makeEveryMethod(
	iterator: luau.Identifier,
	callbackArgsListMaker: (
		keyId: luau.TemporaryIdentifier,
		valueId: luau.TemporaryIdentifier,
		expression: luau.Expression,
	) => Array<luau.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(iterator, callbackArgsListMaker, true);
}

function makeSomeMethod(
	iterator: luau.Identifier,
	callbackArgsListMaker: (
		keyId: luau.TemporaryIdentifier,
		valueId: luau.TemporaryIdentifier,
		expression: luau.Expression,
	) => Array<luau.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(iterator, callbackArgsListMaker, false);
}

function argumentsWithDefaults(
	state: TransformState,
	args: Array<luau.Expression>,
	defaults: Array<luau.Expression>,
): Array<luau.Expression> {
	// potentially nil arguments
	for (let i = 0; i < args.length; i++) {
		args[i] = state.pushToVar(args[i]);
		state.prereq(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.binary(args[i], "==", luau.nil()),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: args[i] as luau.TemporaryIdentifier,
						operator: "=",
						right: defaults[i],
					}),
				),
				elseBody: luau.list.make(),
			}),
		);
	}

	// not specified
	for (let j = args.length; j < defaults.length; j++) {
		args[j] = defaults[j];
	}

	return args;
}

function tryGetNumberLiteralValue(exp: luau.Expression) {
	if (luau.isNumberLiteral(exp)) {
		return Number(exp.value);
	}

	if (luau.isUnaryExpression(exp) && exp.operator === "-" && luau.isNumberLiteral(exp.expression)) {
		return -Number(exp.expression.value);
	}

	return undefined;
}

const ARRAY_LIKE_METHODS: MacroList<PropertyCallMacro> = {
	size,
};

const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) => luau.binary(luau.unary("#", expression), "==", luau.number(0)),

	concat: (state, node, expression, args) => {
		const resultId = state.pushToVar(luau.array());

		args.unshift(expression);

		const sizeId = state.pushToVar(luau.number(1));
		for (const arg of args) {
			const valueId = luau.tempId();
			state.prereq(
				luau.create(luau.SyntaxKind.ForStatement, {
					ids: luau.list.make<luau.AnyIdentifier>(luau.emptyId(), valueId),
					expression: luau.call(luau.globals.ipairs, [arg]),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: resultId,
								index: sizeId,
							}),
							operator: "=",
							right: valueId,
						}),
						luau.create(luau.SyntaxKind.Assignment, {
							left: sizeId,
							operator: "+=",
							right: luau.number(1),
						}),
					),
				}),
			);
		}

		return resultId;
	},

	join: (state, node, expression, args) => {
		args = argumentsWithDefaults(state, args, [luau.strings[", "]]);
		const indexType = state.typeChecker.getIndexTypeOfType(
			state.getType(node.expression.expression),
			ts.IndexKind.Number,
		);

		// table.concat only works on string and number types, so call tostring() otherwise
		if (indexType && isPossiblyType(indexType, t => !isStringType(t) && !isNumberType(t))) {
			expression = state.pushToVarIfComplex(expression);
			const id = state.pushToVar(luau.call(luau.globals.table.create, [luau.unary("#", expression)]));
			const keyId = luau.tempId();
			const valueId = luau.tempId();
			state.prereq(
				luau.create(luau.SyntaxKind.ForStatement, {
					ids: luau.list.make(keyId, valueId),
					expression: luau.call(luau.globals.ipairs, [expression]),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: id,
								index: keyId,
							}),
							operator: "=",
							right: luau.call(luau.globals.tostring, [valueId]),
						}),
					),
				}),
			);

			expression = id;
		}

		return luau.call(luau.globals.table.concat, [expression, args[0]]);
	},

	move: (state, node, expression, args) => {
		const moveArgs = [expression, offset(args[0], 1), offset(args[1], 1), offset(args[2], 1)];
		if (args[3]) {
			moveArgs.push(args[3]);
		}
		return luau.call(luau.globals.table.move, moveArgs);
	},

	slice: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const lengthOfExpression = state.pushToVar(luau.unary("#", expression));
		args = argumentsWithDefaults(state, args, [luau.number(0), lengthOfExpression]);

		let startExp = args[0];
		const startValue = tryGetNumberLiteralValue(startExp);
		if (startValue !== undefined) {
			if (startValue < 0) {
				startExp = offset(lengthOfExpression, startValue);
			}
		} else {
			startExp = state.pushToVarIfNonId(startExp);
			assert(luau.isWritableExpression(startExp));
			state.prereq(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.binary(startExp, "<", luau.number(0)),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, {
							left: startExp,
							operator: "+=",
							right: lengthOfExpression,
						}),
					),
					elseBody: luau.list.make(),
				}),
			);
		}

		let endExp = args[1];
		const endValue = tryGetNumberLiteralValue(endExp);
		if (endValue !== undefined) {
			if (endValue < 0) {
				endExp = offset(lengthOfExpression, endValue);
			}
		} else if (endExp !== lengthOfExpression) {
			endExp = state.pushToVarIfNonId(endExp);
			assert(luau.isWritableExpression(endExp));
			state.prereq(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.binary(endExp, "<", luau.number(0)),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, {
							left: endExp,
							operator: "+=",
							right: lengthOfExpression,
						}),
					),
					elseBody: luau.list.make(),
				}),
			);
		}

		const resultId = state.pushToVar(luau.array());
		const iteratorId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.NumericForStatement, {
				id: iteratorId,
				start: offset(startExp, 1),
				end: endExp,
				step: undefined,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: resultId,
							index:
								luau.isNumberLiteral(startExp) && Number(startExp.value) === 0
									? iteratorId
									: luau.binary(
											iteratorId,
											"-",
											luau.create(luau.SyntaxKind.ParenthesizedExpression, {
												expression: startExp,
											}),
									  ),
						}),
						operator: "=",
						right: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: iteratorId,
						}),
					}),
				),
			}),
		);

		return resultId;
	},

	includes: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const startIndex = offset(args.length > 1 ? args[1] : luau.number(0), 1);

		const resultId = state.pushToVar(luau.bool(false));

		const iteratorId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.NumericForStatement, {
				id: iteratorId,
				start: startIndex,
				end: luau.unary("#", expression),
				step: undefined,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.create(luau.SyntaxKind.BinaryExpression, {
							left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: convertToIndexableExpression(expression),
								index: iteratorId,
							}),
							operator: "==",
							right: args[0],
						}),
						statements: luau.list.make<luau.Statement>(
							luau.create(luau.SyntaxKind.Assignment, {
								left: resultId,
								operator: "=",
								right: luau.bool(true),
							}),
							luau.create(luau.SyntaxKind.BreakStatement, {}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return resultId;
	},

	indexOf: (state, node, expression, args) => {
		const findArgs = [expression, args[0]];

		if (args.length > 1) {
			findArgs.push(offset(args[1], 1));
		}

		return offset(
			luau.create(luau.SyntaxKind.BinaryExpression, {
				left: luau.call(luau.globals.table.find, findArgs),
				operator: "or",
				right: luau.number(0),
			}),
			-1,
		);
	},

	lastIndexOf: (state, node, expression, args) => {
		const startExpression = args.length > 1 ? offset(args[1], 1) : luau.unary("#", expression);

		const result = state.pushToVar(luau.number(-1));
		const iterator = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.NumericForStatement, {
				id: iterator,
				start: startExpression,
				end: luau.number(1),
				step: luau.number(-1),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.create(luau.SyntaxKind.BinaryExpression, {
							left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: convertToIndexableExpression(expression),
								index: iterator,
							}),
							operator: "==",
							right: args[0],
						}),
						statements: luau.list.make<luau.Statement>(
							luau.create(luau.SyntaxKind.Assignment, {
								left: result,
								operator: "=",
								right: offset(iterator, -1),
							}),
							luau.create(luau.SyntaxKind.BreakStatement, {}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return result;
	},

	every: makeEveryMethod(luau.globals.ipairs, (keyId, valueId, expression) => [
		valueId,
		offset(keyId, -1),
		expression,
	]),

	entries: (state, node, expression) => {
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		const valuesId = state.pushToVar(luau.array());

		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(luau.globals.ipairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(valuesId),
							index: keyId,
						}),
						operator: "=",
						right: luau.array([offset(keyId, -1), valueId]),
					}),
				),
			}),
		);

		return valuesId;
	},

	some: makeSomeMethod(luau.globals.ipairs, (keyId, valueId, expression) => [valueId, offset(keyId, -1), expression]),

	forEach: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(args[0]);
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(luau.globals.ipairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(callbackId, [valueId, offset(keyId, -1), expression]),
					}),
				),
			}),
		);

		return luau.nil();
	},

	map: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);
		const newValueId = state.pushToVar(luau.call(luau.globals.table.create, [luau.unary("#", expression)]));
		const callbackId = state.pushToVarIfComplex(args[0]);
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(luau.globals.ipairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: newValueId,
							index: keyId,
						}),
						operator: "=",
						right: luau.call(callbackId, [valueId, offset(keyId, -1), expression]),
					}),
				),
			}),
		);

		return newValueId;
	},

	mapFiltered: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(luau.array());
		const callbackId = state.pushToVarIfComplex(args[0]);
		const lengthId = state.pushToVar(luau.number(0));
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		const resultId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(luau.globals.ipairs, [expression]),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.VariableDeclaration, {
						left: resultId,
						right: luau.call(callbackId, [valueId, offset(keyId, -1), expression]),
					}),
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.binary(resultId, "~=", luau.nil()),
						statements: luau.list.make(
							luau.create(luau.SyntaxKind.Assignment, {
								left: lengthId,
								operator: "+=",
								right: luau.number(1),
							}),
							luau.create(luau.SyntaxKind.Assignment, {
								left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
									expression: newValueId,
									index: lengthId,
								}),
								operator: "=",
								right: resultId,
							}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return newValueId;
	},

	filterUndefined: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const lengthId = state.pushToVar(luau.number(0));
		const indexId1 = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(indexId1),
				expression: luau.call(luau.globals.pairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.binary(indexId1, ">", lengthId),
						statements: luau.list.make(
							luau.create(luau.SyntaxKind.Assignment, {
								left: lengthId,
								operator: "=",
								right: indexId1,
							}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		const resultId = state.pushToVar(luau.array());
		const resultLengthId = state.pushToVar(luau.number(0));
		const indexId2 = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.NumericForStatement, {
				id: indexId2,
				start: luau.number(1),
				end: lengthId,
				step: undefined,

				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.VariableDeclaration, {
						left: valueId,
						right: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: indexId2,
						}),
					}),
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.binary(valueId, "~=", luau.nil()),
						statements: luau.list.make(
							luau.create(luau.SyntaxKind.Assignment, {
								left: resultLengthId,
								operator: "+=",
								right: luau.number(1),
							}),
							luau.create(luau.SyntaxKind.Assignment, {
								left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
									expression: resultId,
									index: resultLengthId,
								}),
								operator: "=",
								right: valueId,
							}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return resultId;
	},

	filter: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(luau.array());
		const callbackId = state.pushToVarIfComplex(args[0]);
		const lengthId = state.pushToVar(luau.number(0));
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(luau.globals.ipairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.create(luau.SyntaxKind.BinaryExpression, {
							left: luau.call(callbackId, [valueId, offset(keyId, -1), expression]),
							operator: "==",
							right: luau.bool(true),
						}),
						statements: luau.list.make(
							luau.create(luau.SyntaxKind.Assignment, {
								left: lengthId,
								operator: "+=",
								right: luau.number(1),
							}),
							luau.create(luau.SyntaxKind.Assignment, {
								left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
									expression: newValueId,
									index: lengthId,
								}),
								operator: "=",
								right: valueId,
							}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return newValueId;
	},

	reduce: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);
		return createReduceMethod(state, node, expression, args, luau.number(1), luau.unary("#", expression), 1);
	},

	reduceRight: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);
		return createReduceMethod(state, node, expression, args, luau.unary("#", expression), luau.number(1), -1);
	},

	reverse: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(luau.map());
		const lengthId = state.pushToVar(luau.unary("#", expression));
		const idxId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.NumericForStatement, {
				id: idxId,
				start: luau.number(1),
				end: lengthId,
				step: undefined,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: resultId,
							index: idxId,
						}),
						operator: "=",
						right: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: luau.binary(lengthId, "+", luau.binary(luau.number(1), "-", idxId)),
						}),
					}),
				),
			}),
		);

		return resultId;
	},

	// entries

	find: makeFindMethod(luau.nil(), true),

	findIndex: makeFindMethod(luau.number(-1), false),

	copy: makeCopyMethod(luau.globals.ipairs, (state, node, expression) => expression),
};

const ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	push: (state, node, expression, args) => {
		if (args.length === 0) {
			return luau.unary("#", expression);
		}

		expression = state.pushToVarIfComplex(expression);

		args = args.map(arg => state.pushToVarIfComplex(arg));
		const valueIsUsed = !isUsedAsStatement(node);
		const uses = (valueIsUsed ? 1 : 0) + args.length;

		let sizeExp: luau.Expression = luau.unary("#", expression);
		if (uses > 1) {
			sizeExp = state.pushToVar(sizeExp);
		}

		for (let i = 0; i < args.length; i++) {
			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: luau.binary(sizeExp, "+", luau.number(i + 1)),
					}),
					operator: "=",
					right: args[i],
				}),
			);
		}

		return valueIsUsed ? luau.binary(sizeExp, "+", luau.number(args.length)) : luau.nil();
	},

	pop: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		let sizeExp: luau.Expression = luau.unary("#", expression);

		const valueIsUsed = !isUsedAsStatement(node);
		let retValue: luau.TemporaryIdentifier;
		if (valueIsUsed) {
			sizeExp = state.pushToVar(sizeExp);
			retValue = state.pushToVar(
				luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: sizeExp,
				}),
			);
		}

		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: sizeExp,
				}),
				operator: "=",
				right: luau.nil(),
			}),
		);

		return valueIsUsed ? retValue! : luau.nil();
	},

	shift: (state, node, expression) => luau.call(luau.globals.table.remove, [expression, luau.number(1)]),

	unshift: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		for (let i = args.length - 1; i >= 0; i--) {
			const arg = args[i];
			state.prereq(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.table.insert, [expression, luau.number(1), arg]),
				}),
			);
		}

		if (isUsedAsStatement(node)) {
			return luau.nil();
		} else {
			return luau.unary("#", expression);
		}
	},

	insert: (state, node, expression, args) => {
		return luau.call(luau.globals.table.insert, [expression, offset(args[0], 1), args[1]]);
	},

	remove: (state, node, expression, args) => luau.call(luau.globals.table.remove, [expression, offset(args[0], 1)]),

	unorderedRemove: (state, node, expression, args) => {
		const arg = args[0];

		expression = state.pushToVarIfComplex(expression);

		const lengthId = state.pushToVar(luau.unary("#", expression));

		const valueIsUsed = !isUsedAsStatement(node);
		let valueId: luau.TemporaryIdentifier;
		if (valueIsUsed) {
			valueId = state.pushToVar(
				luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: offset(arg, 1),
				}),
			);
		}

		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: offset(arg, 1),
				}),
				operator: "=",
				right: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthId,
				}),
			}),
		);

		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthId,
				}),
				operator: "=",
				right: luau.nil(),
			}),
		);

		return valueIsUsed ? valueId! : luau.nil();
	},

	sort: (state, node, expression, args) => {
		const valueIsUsed = !isUsedAsStatement(node);
		if (valueIsUsed) {
			expression = state.pushToVarIfComplex(expression);
		}

		args.unshift(expression);

		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.table.sort, args),
			}),
		);

		return valueIsUsed ? expression : luau.nil();
	},
};

const READONLY_SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) => luau.binary(luau.call(luau.globals.next, [expression]), "==", luau.nil()),

	size: (state, node, expression) => {
		if (isUsedAsStatement(node)) {
			return luau.nil();
		}

		const sizeId = state.pushToVar(luau.number(0));
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(luau.emptyId()),
				expression: luau.call(luau.globals.pairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: sizeId,
						operator: "+=",
						right: luau.number(1),
					}),
				),
			}),
		);
		return sizeId;
	},

	has: (state, node, expression, args) => {
		const left = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: args[0],
		});
		return luau.binary(left, "~=", luau.nil());
	},
};

const SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	delete: (state, node, expression, args) => {
		const arg = state.pushToVarIfComplex(args[0]);
		const valueIsUsed = !isUsedAsStatement(node);
		let valueExistedId: luau.TemporaryIdentifier;
		if (valueIsUsed) {
			valueExistedId = state.pushToVar(
				luau.create(luau.SyntaxKind.BinaryExpression, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: arg,
					}),
					operator: "~=",
					right: luau.nil(),
				}),
			);
		}

		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: arg,
				}),
				operator: "=",
				right: luau.nil(),
			}),
		);

		return valueIsUsed ? valueExistedId! : luau.nil();
	},

	clear: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);
		const keyId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId),
				expression: luau.call(luau.globals.pairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: keyId,
						}),
						operator: "=",
						right: luau.nil(),
					}),
				),
			}),
		);
		return luau.nil();
	},
};

const READONLY_SET_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	forEach: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(args[0]);
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(valueId),
				expression: luau.call(luau.globals.pairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(callbackId, [valueId, valueId, expression]),
					}),
				),
			}),
		);

		return luau.nil();
	},

	values: (state, node, expression) => {
		const valueId = luau.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [valueId], valueId);
	},
};

const SET_METHODS: MacroList<PropertyCallMacro> = {
	...SET_MAP_SHARED_METHODS,

	add: (state, node, expression, args) => {
		const valueIsUsed = !isUsedAsStatement(node);
		if (valueIsUsed) {
			expression = state.pushToVarIfComplex(expression);
		}
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: args[0],
				}),
				operator: "=",
				right: luau.bool(true),
			}),
		);
		return valueIsUsed ? expression : luau.nil();
	},
};

const READONLY_MAP_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	forEach: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(args[0]);
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(luau.globals.pairs, [expression]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(callbackId, [valueId, keyId, expression]),
					}),
				),
			}),
		);

		return luau.nil();
	},

	get: (state, node, expression, args) =>
		luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: args[0],
		}),

	entries: (state, node, expression) => {
		const ids = [luau.tempId(), luau.tempId()];
		return createKeyValuesEntriesMethod(state, node, expression, ids, luau.array(ids));
	},

	keys: (state, node, expression) => {
		const keyId = luau.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [keyId], keyId);
	},

	values: (state, node, expression) => {
		const valueId = luau.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [luau.emptyId(), valueId], valueId);
	},
};

const MAP_METHODS: MacroList<PropertyCallMacro> = {
	...SET_MAP_SHARED_METHODS,

	set: (state, node, expression, args) => {
		const [keyExp, valueExp] = args;
		const valueIsUsed = !isUsedAsStatement(node);
		if (valueIsUsed) {
			expression = state.pushToVarIfComplex(expression);
		}
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: keyExp,
				}),
				operator: "=",
				right: valueExp,
			}),
		);
		return valueIsUsed ? expression : luau.nil();
	},
};

const PROMISE_METHODS: MacroList<PropertyCallMacro> = {
	then: (state, node, expression, args) =>
		luau.create(luau.SyntaxKind.MethodCallExpression, {
			expression: convertToIndexableExpression(expression),
			name: "andThen",
			args: luau.list.make(...args),
		}),
};

function createKeyValuesEntriesMethod(
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	ids: Array<luau.AnyIdentifier>,
	right: luau.Expression,
) {
	const valuesId = state.pushToVar(luau.array());
	const iterId = state.pushToVar(luau.number(0));

	state.prereq(
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(...ids),
			expression: luau.call(luau.globals.pairs, [expression]),
			statements: luau.list.make(
				luau.create(luau.SyntaxKind.Assignment, {
					left: iterId,
					operator: "+=",
					right: luau.number(1),
				}),
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(valuesId),
						index: iterId,
					}),
					operator: "=",
					right,
				}),
			),
		}),
	);

	return valuesId;
}

const OBJECT_METHODS: MacroList<PropertyCallMacro> = {
	assign: runtimeLib("Object_assign", true),
	deepCopy: runtimeLib("Object_deepCopy", true),
	deepEquals: runtimeLib("Object_deepEquals", true),
	fromEntries: runtimeLib("Object_fromEntries", true),

	isEmpty: (state, node, expression, args) => luau.binary(luau.call(luau.globals.next, [args[0]]), "==", luau.nil()),

	keys: (state, node, expression, args) => {
		const keyId = luau.tempId();
		return createKeyValuesEntriesMethod(state, node, args[0], [keyId], keyId);
	},

	values: (state, node, expression, args) => {
		const valueId = luau.tempId();
		return createKeyValuesEntriesMethod(state, node, args[0], [luau.emptyId(), valueId], valueId);
	},

	entries: (state, node, expression, args) => {
		const ids = [luau.tempId(), luau.tempId()];
		return createKeyValuesEntriesMethod(state, node, args[0], ids, luau.array(ids));
	},

	copy: makeCopyMethod(luau.globals.pairs, (state, node, expression, args) => args[0]),
};

export const PROPERTY_CALL_MACROS: { [className: string]: MacroList<PropertyCallMacro> } = {
	// math classes
	CFrame: makeMathSet("+", "-", "*"),
	UDim: makeMathSet("+", "-"),
	UDim2: makeMathSet("+", "-"),
	Vector2: makeMathSet("+", "-", "*", "/"),
	Vector2int16: makeMathSet("+", "-", "*", "/"),
	Vector3: makeMathSet("+", "-", "*", "/"),
	Vector3int16: makeMathSet("+", "-", "*", "/"),

	String: STRING_CALLBACKS,
	ArrayLike: ARRAY_LIKE_METHODS,
	ReadonlyArray: READONLY_ARRAY_METHODS,
	Array: ARRAY_METHODS,
	ReadonlySet: READONLY_SET_METHODS,
	Set: SET_METHODS,
	ReadonlyMap: READONLY_MAP_METHODS,
	Map: MAP_METHODS,
	Promise: PROMISE_METHODS,
	ObjectConstructor: OBJECT_METHODS,
};

// comment logic

function header(text: string) {
	return luau.comment(`▼ ${text} ▼`);
}

function footer(text: string) {
	return luau.comment(`▲ ${text} ▲`);
}

function wasExpressionPushed(statements: luau.List<luau.Statement>, expression: luau.Expression) {
	if (statements.head !== undefined) {
		const firstStatement = statements.head.value;
		if (luau.isVariableDeclaration(firstStatement)) {
			if (!luau.list.isList(firstStatement.left) && luau.isTemporaryIdentifier(firstStatement.left)) {
				if (firstStatement.right === expression) {
					return true;
				}
			}
		}
	}
	return false;
}

function wrapComments(methodName: string, callback: PropertyCallMacro): PropertyCallMacro {
	return (state, callNode, callExp, args) => {
		const [expression, prereqs] = state.capture(() => callback(state, callNode, callExp, args));

		let size = luau.list.size(prereqs);
		if (size > 0) {
			// detect the case of `expression = state.pushToVarIfComplex(expression);` and put header after
			const wasPushed = wasExpressionPushed(prereqs, callExp);
			let pushStatement: luau.Statement | undefined;
			if (wasPushed) {
				pushStatement = luau.list.shift(prereqs);
				size--;
			}
			if (size > 0) {
				luau.list.unshift(prereqs, header(methodName));
				if (wasPushed && pushStatement) {
					luau.list.unshift(prereqs, pushStatement);
				}
				luau.list.push(prereqs, footer(methodName));
			} else {
				if (wasPushed && pushStatement) {
					luau.list.unshift(prereqs, pushStatement);
				}
			}
		}

		state.prereqList(prereqs);
		return expression;
	};
}

// apply comment wrapping
for (const [className, macroList] of Object.entries(PROPERTY_CALL_MACROS)) {
	for (const [methodName, macro] of Object.entries(macroList)) {
		macroList[methodName] = wrapComments(`${className}.${methodName}`, macro);
	}
}
