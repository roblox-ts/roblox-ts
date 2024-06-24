import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { offset } from "TSTransformer/util/offset";
import { isDefinitelyType, isNumberType, isStringType } from "TSTransformer/util/types";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import ts from "typescript";

function makeMathMethod(operator: luau.BinaryOperator): PropertyCallMacro {
	return (state, node, expression, args) => {
		let rhs = args[0];
		if (!luau.isSimple(rhs)) {
			rhs = luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression: rhs });
		}
		return luau.binary(expression, operator, rhs);
	};
}

const OPERATOR_TO_NAME_MAP = new Map<luau.BinaryOperator, "add" | "sub" | "mul" | "div" | "idiv">([
	["+", "add"],
	["-", "sub"],
	["*", "mul"],
	["/", "div"],
	["//", "idiv"],
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

function makeStringCallback(strCallback: luau.PropertyAccessExpression): PropertyCallMacro {
	return (state, node, expression, args) => {
		return luau.call(strCallback, [expression, ...args]);
	};
}

const STRING_CALLBACKS: MacroList<PropertyCallMacro> = {
	size: (state, node, expression) => luau.unary("#", expression),

	byte: makeStringCallback(luau.globals.string.byte),
	find: makeStringCallback(luau.globals.string.find),
	format: makeStringCallback(luau.globals.string.format),
	gmatch: makeStringCallback(luau.globals.string.gmatch),
	gsub: makeStringCallback(luau.globals.string.gsub),
	lower: makeStringCallback(luau.globals.string.lower),
	match: makeStringCallback(luau.globals.string.match),
	rep: makeStringCallback(luau.globals.string.rep),
	reverse: makeStringCallback(luau.globals.string.reverse),
	split: makeStringCallback(luau.globals.string.split),
	sub: makeStringCallback(luau.globals.string.sub),
	upper: makeStringCallback(luau.globals.string.upper),
};

function makeEveryOrSomeMethod(
	callbackArgsListMaker: (
		keyId: luau.TemporaryIdentifier,
		valueId: luau.TemporaryIdentifier,
		expression: luau.Expression,
	) => Array<luau.Expression>,
	initialState: boolean,
): PropertyCallMacro {
	return (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression, "exp");

		const resultId = state.pushToVar(luau.bool(initialState), "result");
		const callbackId = state.pushToVarIfNonId(args[0], "callback");

		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");

		const callCallback = luau.call(callbackId, callbackArgsListMaker(keyId, valueId, expression));
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression,
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
	callbackArgsListMaker: (
		keyId: luau.TemporaryIdentifier,
		valueId: luau.TemporaryIdentifier,
		expression: luau.Expression,
	) => Array<luau.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(callbackArgsListMaker, true);
}

function makeSomeMethod(
	callbackArgsListMaker: (
		keyId: luau.TemporaryIdentifier,
		valueId: luau.TemporaryIdentifier,
		expression: luau.Expression,
	) => Array<luau.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(callbackArgsListMaker, false);
}

function argumentsWithDefaults(
	state: TransformState,
	args: Array<luau.Expression>,
	defaults: Array<luau.Expression>,
): Array<luau.Expression> {
	// potentially nil arguments
	for (let i = 0; i < args.length; i++) {
		if (!luau.isSimplePrimitive(args[i])) {
			args[i] = state.pushToVar(args[i], valueToIdStr(args[i]) || `arg${i}`);
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

const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) => luau.binary(luau.unary("#", expression), "==", luau.number(0)),

	join: (state, node, expression, args) => {
		args = argumentsWithDefaults(state, args, [luau.strings[", "]]);
		const indexType = state.typeChecker.getIndexTypeOfType(
			state.getType(node.expression.expression),
			ts.IndexKind.Number,
		);

		// table.concat only works on string and number types, so call tostring() otherwise
		if (indexType && !isDefinitelyType(indexType, isStringType, isNumberType)) {
			expression = state.pushToVarIfComplex(expression, "exp");
			const id = state.pushToVar(luau.call(luau.globals.table.create, [luau.unary("#", expression)]), "result");
			const keyId = luau.tempId("k");
			const valueId = luau.tempId("v");
			state.prereq(
				luau.create(luau.SyntaxKind.ForStatement, {
					ids: luau.list.make(keyId, valueId),
					expression,
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
		const callArgs = [expression, args[0]];
		if (args[1]) {
			callArgs.push(offset(args[1], 1));
		}
		return luau.binary(luau.call(luau.globals.table.find, callArgs), "~=", luau.nil());
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

	every: makeEveryMethod((keyId, valueId, expression) => [valueId, offset(keyId, -1), expression]),

	some: makeSomeMethod((keyId, valueId, expression) => [valueId, offset(keyId, -1), expression]),

	forEach: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression, "exp");

		const callbackId = state.pushToVarIfNonId(args[0], "callback");
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(callbackId, [valueId, offset(keyId, -1), expression]),
					}),
				),
			}),
		);

		return !isUsedAsStatement(node) ? luau.nil() : luau.none();
	},

	map: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression, "exp");
		const newValueId = state.pushToVar(
			luau.call(luau.globals.table.create, [luau.unary("#", expression)]),
			"newValue",
		);
		const callbackId = state.pushToVarIfNonId(args[0], "callback");
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression,
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
		expression = state.pushToVarIfComplex(expression, "exp");

		const newValueId = state.pushToVar(luau.array(), "newValue");
		const callbackId = state.pushToVarIfNonId(args[0], "callback");
		const lengthId = state.pushToVar(luau.number(0), "length");
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		const resultId = luau.tempId("result");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression,
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
		expression = state.pushToVarIfComplex(expression, "exp");

		const lengthId = state.pushToVar(luau.number(0), "length");
		const indexId1 = luau.tempId("i");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(indexId1),
				expression,
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

		const resultId = state.pushToVar(luau.array(), "result");
		const resultLengthId = state.pushToVar(luau.number(0), "resultLength");
		const indexId2 = luau.tempId("i");
		const valueId = luau.tempId("v");
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
		expression = state.pushToVarIfComplex(expression, "exp");

		const newValueId = state.pushToVar(luau.array(), "newValue");
		const callbackId = state.pushToVarIfNonId(args[0], "callback");
		const lengthId = state.pushToVar(luau.number(0), "length");
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression,
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
		expression = state.pushToVarIfComplex(expression, "exp");

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
				"result",
			);
			start = offset(start, step);
		} else {
			resultId = state.pushToVar(args[1], "result");
		}
		const callbackId = state.pushToVar(args[0], "callback");

		const iteratorId = luau.tempId("i");
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
		expression = state.pushToVarIfComplex(expression, "exp");

		const callbackId = state.pushToVarIfNonId(args[0], "callback");
		const loopId = luau.tempId("i");
		const valueId = luau.tempId("v");
		const resultId = state.pushToVar(undefined, "result");

		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				expression,
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
								left: resultId,
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

		return resultId;
	},

	findIndex: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression, "exp");

		const callbackId = state.pushToVarIfNonId(args[0], "callback");
		const loopId = luau.tempId("i");
		const valueId = luau.tempId("v");
		const resultId = state.pushToVar(luau.number(-1), "result");

		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				expression,
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
								left: resultId,
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

		return resultId;
	},
};

const ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	push: (state, node, expression, args) => {
		// for `a.push()` always emit luau.unary so the call doesn't disappear in emit
		if (args.length === 0) {
			return luau.unary("#", expression);
		}

		expression = state.pushToVarIfComplex(expression, "exp");

		for (let i = 0; i < args.length; i++) {
			state.prereq(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.table.insert, [expression, args[i]]),
				}),
			);
		}

		return !isUsedAsStatement(node) ? luau.unary("#", expression) : luau.none();
	},

	pop: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression, "exp");

		let lengthExp: luau.Expression = luau.unary("#", expression);

		const returnValueIsUsed = !isUsedAsStatement(node);
		let retValue: luau.TemporaryIdentifier;
		if (returnValueIsUsed) {
			lengthExp = state.pushToVar(lengthExp, "length");
			retValue = state.pushToVar(
				luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthExp,
				}),
				"result",
			);
		}

		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthExp,
				}),
				operator: "=",
				right: luau.nil(),
			}),
		);

		return returnValueIsUsed ? retValue! : luau.none();
	},

	shift: (state, node, expression) => luau.call(luau.globals.table.remove, [expression, luau.number(1)]),

	unshift: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression, "exp");

		for (let i = args.length - 1; i >= 0; i--) {
			const arg = args[i];
			state.prereq(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.table.insert, [expression, luau.number(1), arg]),
				}),
			);
		}

		return !isUsedAsStatement(node) ? luau.unary("#", expression) : luau.none();
	},

	insert: (state, node, expression, args) => {
		return luau.call(luau.globals.table.insert, [expression, offset(args[0], 1), args[1]]);
	},

	remove: (state, node, expression, args) => luau.call(luau.globals.table.remove, [expression, offset(args[0], 1)]),

	unorderedRemove: (state, node, expression, args) => {
		const indexExp = state.pushToVarIfComplex(offset(args[0], 1), "index");

		expression = state.pushToVarIfComplex(expression, "exp");

		const lengthId = state.pushToVar(luau.unary("#", expression), "length");

		const valueIsUsed = !isUsedAsStatement(node);
		const valueId = state.pushToVar(
			luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(expression),
				index: indexExp,
			}),
			"value",
		);

		state.prereq(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.binary(valueId, "~=", luau.nil()),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: indexExp,
						}),
						operator: "=",
						right: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: lengthId,
						}),
					}),
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: lengthId,
						}),
						operator: "=",
						right: luau.nil(),
					}),
				),
				elseBody: luau.list.make(),
			}),
		);

		return valueIsUsed ? valueId : luau.none();
	},

	sort: (state, node, expression, args) => {
		const valueIsUsed = !isUsedAsStatement(node);
		if (valueIsUsed) {
			expression = state.pushToVarIfComplex(expression, "exp");
		}

		args.unshift(expression);

		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.table.sort, args),
			}),
		);

		return valueIsUsed ? expression : luau.none();
	},

	clear: (state, node, expression) => {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.table.clear, [expression]),
			}),
		);
		return !isUsedAsStatement(node) ? luau.nil() : luau.none();
	},
};

const READONLY_SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) => luau.binary(luau.call(luau.globals.next, [expression]), "==", luau.nil()),

	size: (state, node, expression) => {
		const sizeId = state.pushToVar(luau.number(0), "size");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(luau.tempId()),
				expression,
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
		const arg = state.pushToVarIfComplex(args[0], "value");
		const valueIsUsed = !isUsedAsStatement(node);
		let valueExistedId: luau.TemporaryIdentifier;
		if (valueIsUsed) {
			expression = state.pushToVarIfNonId(expression, "exp");
			valueExistedId = state.pushToVar(
				luau.create(luau.SyntaxKind.BinaryExpression, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression,
						index: arg,
					}),
					operator: "~=",
					right: luau.nil(),
				}),
				"valueExisted",
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

		return valueIsUsed ? valueExistedId! : luau.none();
	},

	clear: (state, node, expression) => {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.table.clear, [expression]),
			}),
		);
		return !isUsedAsStatement(node) ? luau.nil() : luau.none();
	},
};

const READONLY_SET_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	forEach: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression, "exp");

		const callbackId = state.pushToVarIfNonId(args[0], "callback");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(valueId),
				expression,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(callbackId, [valueId, valueId, expression]),
					}),
				),
			}),
		);

		return !isUsedAsStatement(node) ? luau.nil() : luau.none();
	},
};

const SET_METHODS: MacroList<PropertyCallMacro> = {
	...SET_MAP_SHARED_METHODS,

	add: (state, node, expression, args) => {
		const valueIsUsed = !isUsedAsStatement(node);
		if (valueIsUsed) {
			expression = state.pushToVarIfComplex(expression, "exp");
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
		return valueIsUsed ? expression : luau.none();
	},
};

const READONLY_MAP_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	forEach: (state, node, expression, args) => {
		expression = state.pushToVarIfComplex(expression, "exp");

		const callbackId = state.pushToVarIfNonId(args[0], "callback");
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(callbackId, [valueId, keyId, expression]),
					}),
				),
			}),
		);

		return !isUsedAsStatement(node) ? luau.nil() : luau.none();
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
			expression = state.pushToVarIfComplex(expression, "exp");
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
		return valueIsUsed ? expression : luau.none();
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
	Vector2: makeMathSet("+", "-", "*", "/", "//"),
	Vector2int16: makeMathSet("+", "-", "*", "/"),
	Vector3: makeMathSet("+", "-", "*", "/", "//"),
	Vector3int16: makeMathSet("+", "-", "*", "/"),
	Number: makeMathSet("//"),

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
	return luau.comment(` ▼ ${text} ▼`);
}

function footer(text: string) {
	return luau.comment(` ▲ ${text} ▲`);
}

function wasExpressionPushed(statements: luau.List<luau.Statement>, expression: luau.Expression) {
	if (luau.list.isNonEmpty(statements)) {
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
			// detect the case of `expression = state.pushToVarIfComplex(expression, "exp");` and put header after
			const wasPushed = wasExpressionPushed(prereqs, callExp);
			let pushStatement: luau.Statement | undefined;
			if (wasPushed) {
				pushStatement = luau.list.shift(prereqs);
				size--;
			}
			if (size > 1) {
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
