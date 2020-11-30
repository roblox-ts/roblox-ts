import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { offset } from "TSTransformer/util/offset";
import { isNumberType, isPossiblyType, isStringType } from "TSTransformer/util/types";
import { warnings } from "Shared/diagnostics";

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

function offsetArguments(
	state: TransformState,
	node: ts.Expression,
	args: Array<luau.Expression>,
	argOffsets: Array<number>,
) {
	if (state.data.logStringChanges) {
		state.addDiagnostic(warnings.stringOffsetChange(JSON.stringify(argOffsets))(node));
	}
	return args;
}

function makeStringCallback(
	strCallback: luau.PropertyAccessExpression,
	argOffsets: Array<number> = [],
): PropertyCallMacro {
	return (state, node, expression, args) => {
		return luau.call(strCallback, [expression, ...offsetArguments(state, node, args, argOffsets)]);
	};
}

const STRING_CALLBACKS: MacroList<PropertyCallMacro> = {
	size: (state, node, expression) => luau.unary("#", expression),

	byte: makeStringCallback(luau.globals.string.byte, [1, 0]),
	find: makeStringCallback(luau.globals.string.find, [0, 1]),
	format: makeStringCallback(luau.globals.string.format),
	gmatch: makeStringCallback(luau.globals.string.gmatch),
	gsub: makeStringCallback(luau.globals.string.gsub),
	lower: makeStringCallback(luau.globals.string.lower),
	match: makeStringCallback(luau.globals.string.match),
	rep: makeStringCallback(luau.globals.string.rep),
	reverse: makeStringCallback(luau.globals.string.reverse),
	split: makeStringCallback(luau.globals.string.split),
	sub: makeStringCallback(luau.globals.string.sub, [1, 1]),
	upper: makeStringCallback(luau.globals.string.upper),
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

const ARRAY_LIKE_METHODS: MacroList<PropertyCallMacro> = {
	size: (state, node, expression) => luau.unary("#", expression),
};

function makeFindMethod(): PropertyCallMacro {
	return;
}

const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) => luau.binary(luau.unary("#", expression), "==", luau.number(0)),

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

	every: makeEveryMethod(luau.globals.ipairs, (keyId, valueId, expression) => [
		valueId,
		offset(keyId, -1),
		expression,
	]),

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

		let start: luau.Expression = luau.number(1);
		const end = luau.unary("#", expression);
		const step = 1;

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
	},

	find: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(args[0]);
		const loopId = luau.tempId();
		const valueId = luau.tempId();
		const returnId = state.pushToVar(luau.nil());

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
								right: valueId,
							}),
							luau.create(luau.SyntaxKind.BreakStatement, {}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return returnId;
	},

	findIndex: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(args[0]);
		const loopId = luau.tempId();
		const valueId = luau.tempId();
		const returnId = state.pushToVar(luau.number(-1));

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
								right: offset(loopId, -1),
							}),
							luau.create(luau.SyntaxKind.BreakStatement, {}),
						),
						elseBody: luau.list.make(),
					}),
				),
			}),
		);

		return returnId;
	},
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
