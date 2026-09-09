import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { TransformState } from "TSTransformer/classes/TransformState";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { offset } from "TSTransformer/util/offset";
import {
	isDefinitelyType,
	isNumberType,
	isPossiblyType,
	isStringType,
	isUndefinedType,
} from "TSTransformer/util/types";
import ts from "typescript";

function makeMathMethod(operator: luau.BinaryOperator): PropertyCallMacro {
	return (state, prereqs, node, expression, args) => {
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
	return (state, prereqs, node, expression, args) => {
		return luau.call(strCallback, [expression, ...args]);
	};
}

const STRING_CALLBACKS: MacroList<PropertyCallMacro> = {
	size: (state, prereqs, node, expression) => luau.unary("#", expression),

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
	return (state, prereqs, node, expression, args) => {
		const resultId = prereqs.pushToVar(luau.bool(initialState), "result");
		const callbackId = convertToIndexableExpression(args[0]);

		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");

		const callCallback = luau.call(callbackId, callbackArgsListMaker(keyId, valueId, expression));
		prereqs.push(
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
	node: ts.CallExpression,
	args: Array<luau.Expression>,
	defaults: Array<luau.Expression>,
): Array<luau.Expression> {
	for (let i = 0; i < defaults.length; i++) {
		const argument = args[i];
		const source = node.arguments[i];
		if (argument === undefined || luau.isNilLiteral(argument)) {
			args[i] = defaults[i];
		} else if (
			!luau.isSimplePrimitive(argument) &&
			(!source || ts.isSpreadElement(source) || isPossiblyType(state.getType(source), isUndefinedType))
		) {
			args[i] = luau.create(luau.SyntaxKind.IfExpression, {
				condition: luau.binary(argument, "==", luau.nil()),
				expression: defaults[i],
				alternative: argument,
			});
		}
	}

	return args;
}

const ARRAY_LIKE_METHODS: MacroList<PropertyCallMacro> = {
	size: (state, prereqs, node, expression) => luau.unary("#", expression),
};

const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, prereqs, node, expression) => luau.binary(luau.unary("#", expression), "==", luau.number(0)),

	join: (state, prereqs, node, expression, args) => {
		args = argumentsWithDefaults(state, node, args, [luau.strings[", "]]);
		const indexType = state.typeChecker.getIndexTypeOfType(
			state.getType(node.expression.expression),
			ts.IndexKind.Number,
		);

		// table.concat only works on string and number types, so call tostring() otherwise
		if (indexType && !isDefinitelyType(indexType, isStringType, isNumberType)) {
			const id = prereqs.pushToVar(luau.call(luau.globals.table.create, [luau.unary("#", expression)]), "result");
			const keyId = luau.tempId("k");
			const valueId = luau.tempId("v");
			prereqs.push(
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

	move: (state, prereqs, node, expression, args) => {
		const moveArgs = [expression, offset(args[0], 1), offset(args[1], 1), offset(args[2], 1)];
		if (args[3]) {
			moveArgs.push(args[3]);
		}
		return luau.call(luau.globals.table.move, moveArgs);
	},

	includes: (state, prereqs, node, expression, args) => {
		const callArgs = [expression, args[0]];
		if (args[1]) {
			callArgs.push(offset(args[1], 1));
		}
		return luau.binary(luau.call(luau.globals.table.find, callArgs), "~=", luau.nil());
	},

	indexOf: (state, prereqs, node, expression, args) => {
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

	forEach: (state, prereqs, node, expression, args) => {
		const callbackId = convertToIndexableExpression(args[0]);
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		prereqs.push(
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

	map: (state, prereqs, node, expression, args) => {
		const newValueId = prereqs.pushToVar(
			luau.call(luau.globals.table.create, [luau.unary("#", expression)]),
			"newValue",
		);
		const callbackId = convertToIndexableExpression(args[0]);
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		prereqs.push(
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

	mapFiltered: (state, prereqs, node, expression, args) => {
		const newValueId = prereqs.pushToVar(luau.array(), "newValue");
		const callbackId = convertToIndexableExpression(args[0]);
		const lengthId = prereqs.pushToVar(luau.number(0), "length");
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		const resultId = luau.tempId("result");
		prereqs.push(
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

	filterUndefined: (state, prereqs, node, expression) => {
		const lengthId = prereqs.pushToVar(luau.number(0), "length");
		const indexId1 = luau.tempId("i");
		prereqs.push(
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

		const resultId = prereqs.pushToVar(luau.array(), "result");
		const resultLengthId = prereqs.pushToVar(luau.number(0), "resultLength");
		const indexId2 = luau.tempId("i");
		const valueId = luau.tempId("v");
		prereqs.push(
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

	filter: (state, prereqs, node, expression, args) => {
		const newValueId = prereqs.pushToVar(luau.array(), "newValue");
		const callbackId = convertToIndexableExpression(args[0]);
		const lengthId = prereqs.pushToVar(luau.number(0), "length");
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		prereqs.push(
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

	reduce: (state, prereqs, node, expression, args) => {
		let start: luau.Expression = luau.number(1);
		const end = luau.unary("#", expression);
		const step = 1;

		const lengthExp = luau.unary("#", expression);

		let resultId;
		// if there was no initialValue supplied
		if (args.length < 2) {
			prereqs.push(
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
			resultId = prereqs.pushToVar(
				luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: start,
				}),
				"result",
			);
			start = offset(start, step);
		} else {
			resultId = prereqs.pushToVar(args[1], "result");
		}
		const callbackId = convertToIndexableExpression(args[0]);

		const iteratorId = luau.tempId("i");
		prereqs.push(
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

	find: (state, prereqs, node, expression, args) => {
		const callbackId = convertToIndexableExpression(args[0]);
		const loopId = luau.tempId("i");
		const valueId = luau.tempId("v");
		const resultId = prereqs.pushToVar(undefined, "result");

		prereqs.push(
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

	findIndex: (state, prereqs, node, expression, args) => {
		const callbackId = convertToIndexableExpression(args[0]);
		const loopId = luau.tempId("i");
		const valueId = luau.tempId("v");
		const resultId = prereqs.pushToVar(luau.number(-1), "result");

		prereqs.push(
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
	push: (state, prereqs, node, expression, args) => {
		// for `a.push()` always emit luau.unary so the call doesn't disappear in emit
		if (args.length === 0) {
			return luau.unary("#", expression);
		}

		for (let i = 0; i < args.length; i++) {
			prereqs.push(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.table.insert, [expression, args[i]]),
				}),
			);
		}

		return !isUsedAsStatement(node) ? luau.unary("#", expression) : luau.none();
	},

	pop: (state, prereqs, node, expression) => {
		let lengthExp: luau.Expression = luau.unary("#", expression);

		const returnValueIsUsed = !isUsedAsStatement(node);
		let retValue: luau.TemporaryIdentifier;
		if (returnValueIsUsed) {
			lengthExp = prereqs.pushToVar(lengthExp, "length");
			retValue = prereqs.pushToVar(
				luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthExp,
				}),
				"result",
			);
		}

		prereqs.push(
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

	shift: (state, prereqs, node, expression) => luau.call(luau.globals.table.remove, [expression, luau.number(1)]),

	unshift: (state, prereqs, node, expression, args) => {
		for (let i = args.length - 1; i >= 0; i--) {
			const arg = args[i];
			prereqs.push(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.table.insert, [expression, luau.number(1), arg]),
				}),
			);
		}

		return !isUsedAsStatement(node) ? luau.unary("#", expression) : luau.none();
	},

	insert: (state, prereqs, node, expression, args) => {
		return luau.call(luau.globals.table.insert, [expression, offset(args[0], 1), args[1]]);
	},

	remove: (state, prereqs, node, expression, args) =>
		luau.call(luau.globals.table.remove, [expression, offset(args[0], 1)]),

	unorderedRemove: (state, prereqs, node, expression, args) => {
		const indexExp = prereqs.pushToVarIfComplex(offset(args[0], 1), "index");

		const lengthId = prereqs.pushToVar(luau.unary("#", expression), "length");

		const valueIsUsed = !isUsedAsStatement(node);
		const valueId = prereqs.pushToVar(
			luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(expression),
				index: indexExp,
			}),
			"value",
		);

		prereqs.push(
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

	sort: (state, prereqs, node, expression, args) => {
		const valueIsUsed = !isUsedAsStatement(node);

		args.unshift(expression);

		prereqs.push(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.table.sort, args),
			}),
		);

		return valueIsUsed ? expression : luau.none();
	},

	clear: (state, prereqs, node, expression) => {
		prereqs.push(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.table.clear, [expression]),
			}),
		);
		return !isUsedAsStatement(node) ? luau.nil() : luau.none();
	},
};

const READONLY_SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, prereqs, node, expression) =>
		luau.binary(luau.call(luau.globals.next, [expression]), "==", luau.nil()),

	size: (state, prereqs, node, expression) => {
		const sizeId = prereqs.pushToVar(luau.number(0), "size");
		prereqs.push(
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

	has: (state, prereqs, node, expression, args) => {
		const left = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: args[0],
		});
		return luau.binary(left, "~=", luau.nil());
	},
};

const SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	delete: (state, prereqs, node, expression, args) => {
		const arg = args[0];
		const valueIsUsed = !isUsedAsStatement(node);
		let valueExistedId: luau.TemporaryIdentifier;
		if (valueIsUsed) {
			valueExistedId = prereqs.pushToVar(
				luau.create(luau.SyntaxKind.BinaryExpression, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: arg,
					}),
					operator: "~=",
					right: luau.nil(),
				}),
				"valueExisted",
			);
		}

		prereqs.push(
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

	clear: (state, prereqs, node, expression) => {
		prereqs.push(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.globals.table.clear, [expression]),
			}),
		);
		return !isUsedAsStatement(node) ? luau.nil() : luau.none();
	},
};

const READONLY_SET_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	forEach: (state, prereqs, node, expression, args) => {
		const callbackId = convertToIndexableExpression(args[0]);
		const valueId = luau.tempId("v");
		prereqs.push(
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

	add: (state, prereqs, node, expression, args) => {
		const valueIsUsed = !isUsedAsStatement(node);
		prereqs.push(
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

	forEach: (state, prereqs, node, expression, args) => {
		const callbackId = convertToIndexableExpression(args[0]);
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		prereqs.push(
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

	get: (state, prereqs, node, expression, args) =>
		luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: args[0],
		}),
};

const MAP_METHODS: MacroList<PropertyCallMacro> = {
	...SET_MAP_SHARED_METHODS,

	set: (state, prereqs, node, expression, args) => {
		const [keyExp, valueExp] = args;
		const valueIsUsed = !isUsedAsStatement(node);
		prereqs.push(
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
	then: (state, prereqs, node, expression, args) =>
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
	vector: makeMathSet("+", "-", "*", "/", "//"),
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

function wrapComments(methodName: string, callback: PropertyCallMacro): PropertyCallMacro {
	return (state, prereqs, callNode, callExp, args) => {
		const expressionPrereqs = new Prereqs();
		const expression = callback(state, expressionPrereqs, callNode, callExp, args);
		if (luau.list.size(expressionPrereqs.statements) > 1) {
			expressionPrereqs.unshift(header(methodName));
			expressionPrereqs.push(footer(methodName));
		}
		prereqs.pushList(expressionPrereqs.statements);
		return expression;
	};
}

// apply comment wrapping
for (const [className, macroList] of Object.entries(PROPERTY_CALL_MACROS)) {
	for (const [methodName, macro] of Object.entries(macroList)) {
		macroList[methodName] = wrapComments(`${className}.${methodName}`, macro);
	}
}
