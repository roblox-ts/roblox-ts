import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { offset } from "TSTransformer/util/offset";

function ipairs(expression: luau.Expression): luau.Expression {
	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.ipairs,
		args: luau.list.make(expression),
	});
}

function pairs(expression: luau.Expression): luau.Expression {
	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.pairs,
		args: luau.list.make(expression),
	});
}

function runtimeLib(name: string, isStatic = false): PropertyCallMacro {
	return (state, node, expression) => {
		const args = luau.list.make(...ensureTransformOrder(state, node.arguments));
		if (!isStatic) {
			luau.list.unshift(args, expression);
		}
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: state.TS(name),
			args,
		});
	};
}

function makeMathMethod(operator: luau.BinaryOperator): PropertyCallMacro {
	return (state, node, expression) => {
		const [right, prereqs] = state.capture(() => transformExpression(state, node.arguments[0]));
		const left = luau.list.isEmpty(prereqs) ? expression : state.pushToVar(expression);
		state.prereqList(prereqs);
		return luau.binary(left, operator, right);
	};
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
				args[i] = luau.number(arg.value + offsetValue);
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
	return (state, node, expression) => {
		const args = offsetArguments(ensureTransformOrder(state, node.arguments), argOffsets);
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: strCallback,
			args: luau.list.make(expression, ...args),
		});
	};
}

function makeFindMethod(initialValue: luau.Expression, returnValue: boolean): PropertyCallMacro {
	return (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const loopId = luau.tempId();
		const valueId = luau.tempId();
		const returnId = state.pushToVar(initialValue);

		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				expression: ipairs(expression),
				ids: luau.list.make(loopId, valueId),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.create(luau.SyntaxKind.BinaryExpression, {
							left: luau.create(luau.SyntaxKind.CallExpression, {
								expression: callbackId,
								args: luau.list.make(valueId, offset(loopId, -1), expression),
							}),
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
	start: luau.Expression,
	end: luau.Expression,
	step: number,
): luau.Expression {
	const args = ensureTransformOrder(state, node.arguments);

	const lengthExp = luau.unary("#", expression);

	let resultId;
	// if there was no initialValue supplied
	if (args.length < 2) {
		state.prereq(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.create(luau.SyntaxKind.BinaryExpression, {
					left: lengthExp,
					operator: "==",
					right: luau.number(0),
				}),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.create(luau.SyntaxKind.CallExpression, {
							expression: luau.globals.error,
							args: luau.list.make(
								luau.string(
									"Attempted to call `ReadonlyArray.reduce()` on an empty array without an initialValue.",
								),
							),
						}),
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
					right: luau.create(luau.SyntaxKind.CallExpression, {
						expression: callbackId,
						args: luau.list.make(
							resultId,
							luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: convertToIndexableExpression(expression),
								index: iteratorId,
							}),
							offset(iteratorId, -1),
							expression,
						),
					}),
				}),
			),
		}),
	);

	return resultId;
}

const size: PropertyCallMacro = (state, node, expression) => luau.unary("#", expression);

function stringMatchCallback(pattern: string): PropertyCallMacro {
	return (state, node, expression) =>
		luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.string.match,
			args: luau.list.make(expression, luau.string(pattern)),
		});
}

function makeCopyMethod(iterator: luau.Identifier, makeExpression: PropertyCallMacro): PropertyCallMacro {
	return (state, node, expression) => {
		const arrayCopyId = state.pushToVar(luau.map());
		const valueId = luau.tempId();
		const keyId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: iterator,
					args: luau.list.make(makeExpression(state, node, expression)),
				}),
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
const findStringOccurenceMacro: PropertyCallMacro = (state, node, expression) =>
	luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.string.find,
		args: luau.list.make(
			expression, // base string
			transformExpression(state, node.arguments[0]), // search string
			node.arguments[1] ? offset(transformExpression(state, node.arguments[1]), 1) : luau.number(1),
			luau.bool(true),
		),
	});

const STRING_CALLBACKS: MacroList<PropertyCallMacro> = {
	size,
	trim: stringMatchCallback("^%s*(.-)%s*$"),
	trimStart: stringMatchCallback("^%s*(.-)$"),
	trimEnd: stringMatchCallback("^(.-)%s*$"),
	split: makeStringCallback(luau.globals.string.split),
	slice: makeStringCallback(luau.globals.string.sub, [1, 0]),
	sub: makeStringCallback(luau.globals.string.sub, [1, 1]),
	byte: makeStringCallback(luau.globals.string.byte, [1, 1]),
	format: makeStringCallback(luau.globals.string.format),
	gmatch: makeStringCallback(luau.globals.string.gmatch),
	find: (state, node, expression) =>
		luau.create(luau.SyntaxKind.CallExpression, {
			expression: state.TS("string_find_wrap"),
			args: luau.list.make(findMacro(state, node, expression)),
		}),
	includes: (state, node, expression) =>
		luau.create(luau.SyntaxKind.BinaryExpression, {
			left: findStringOccurenceMacro(state, node, expression),
			operator: "~=",
			right: luau.nil(),
		}),
	indexOf: (state, node, expression) => {
		// pushToVar to avoid LuaTuple unpacking into the usage of the result
		const result = state.pushToVar(findStringOccurenceMacro(state, node, expression));
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
	) => luau.List<luau.Expression>,
	initialState: boolean,
): PropertyCallMacro {
	return (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(luau.bool(initialState));
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));

		const keyId = luau.tempId();
		const valueId = luau.tempId();

		const callCallback = luau.create(luau.SyntaxKind.CallExpression, {
			expression: callbackId,
			args: callbackArgsListMaker(keyId, valueId, expression),
		});
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: iterator,
					args: luau.list.make(expression),
				}),
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
	) => luau.List<luau.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(iterator, callbackArgsListMaker, true);
}

function makeSomeMethod(
	iterator: luau.Identifier,
	callbackArgsListMaker: (
		keyId: luau.TemporaryIdentifier,
		valueId: luau.TemporaryIdentifier,
		expression: luau.Expression,
	) => luau.List<luau.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(iterator, callbackArgsListMaker, false);
}

function argumentsWithDefaults(
	state: TransformState,
	args: ts.NodeArray<ts.Expression>,
	defaults: Array<luau.Expression>,
): Array<luau.Expression> {
	const transformed = ensureTransformOrder(state, args, (state, exp, index) => {
		const type = state.getType(exp);

		return type.flags === ts.TypeFlags.Undefined ? defaults[index] : transformExpression(state, exp);
	});

	for (const i in defaults) {
		if (transformed[i] === undefined) {
			transformed[i] = defaults[i];
		}
	}

	return transformed;
}

const ARRAY_LIKE_METHODS: MacroList<PropertyCallMacro> = {
	size,
};

const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) => luau.binary(luau.unary("#", expression), "==", luau.number(0)),

	// toString - likely to be dropped for @rbxts/inspect

	concat: (state, node, expression) => {
		const resultId = state.pushToVar(luau.array());

		const args = ensureTransformOrder(state, node.arguments);
		args.unshift(expression);

		const sizeId = state.pushToVar(luau.number(1));
		for (const arg of args) {
			const valueId = luau.tempId();
			state.prereq(
				luau.create(luau.SyntaxKind.ForStatement, {
					ids: luau.list.make<luau.AnyIdentifier>(luau.emptyId(), valueId),
					expression: ipairs(arg),
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

	join: (state, node, expression) => {
		const args = argumentsWithDefaults(state, node.arguments, [luau.strings[", "]]);

		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.table.concat,
			args: luau.list.make(expression, args[0]),
		});
	},

	slice: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const lengthOfExpression = luau.unary("#", expression);
		const args = argumentsWithDefaults(state, node.arguments, [luau.number(0), lengthOfExpression]);

		// returns the value of a 'NegativeLiteral'
		// however, those do not exist
		// so this function will check to see if:
		//		exp is a UnaryExpression
		//		the expression of exp is a NumberLiteral
		//		the operator is unary minus
		// then return the value of that literal
		const getValueFromNegativeLiteral = (exp: luau.Expression) =>
			luau.isUnaryExpression(exp) && luau.isNumberLiteral(exp.expression) && exp.operator === "-"
				? -exp.expression.value
				: undefined;

		let start = args[0];
		const startValue = getValueFromNegativeLiteral(start);
		if (startValue) {
			start = offset(lengthOfExpression, startValue + 1);
		} else {
			start = offset(start, 1);
		}

		let end = args[1];
		const endValue = getValueFromNegativeLiteral(end);
		if (endValue) {
			end = offset(lengthOfExpression, endValue);
		} else if (end !== lengthOfExpression) {
			end = luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.math.min,
				args: luau.list.make(lengthOfExpression, end),
			});
		}

		const resultId = state.pushToVar(luau.array());

		const sizeId = state.pushToVar(luau.number(1));
		const iteratorId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.NumericForStatement, {
				id: iteratorId,
				start,
				end,
				step: undefined,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: resultId,
							index: sizeId,
						}),
						operator: "=",
						right: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: iteratorId,
						}),
					}),
					luau.create(luau.SyntaxKind.Assignment, {
						left: sizeId,
						operator: "+=",
						right: luau.number(1),
					}),
				),
			}),
		);

		return resultId;
	},

	includes: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const nodeArgs = ensureTransformOrder(state, node.arguments);
		const startIndex = offset(nodeArgs.length > 1 ? nodeArgs[1] : luau.number(0), 1);

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
							right: nodeArgs[0],
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

	indexOf: (state, node, expression) => {
		const nodeArgs = ensureTransformOrder(state, node.arguments);
		const findArgs = luau.list.make(expression, nodeArgs[0]);

		if (nodeArgs.length > 1) {
			luau.list.push(findArgs, offset(nodeArgs[1], 1));
		}

		return offset(
			luau.create(luau.SyntaxKind.BinaryExpression, {
				left: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.table.find,
					args: findArgs,
				}),
				operator: "or",
				right: luau.number(0),
			}),
			-1,
		);
	},

	lastIndexOf: (state, node, expression) => {
		const nodeArgs = ensureTransformOrder(state, node.arguments);

		const startExpression = nodeArgs.length > 1 ? offset(nodeArgs[1], 1) : luau.unary("#", expression);

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
							right: nodeArgs[0],
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

	every: makeEveryMethod(luau.globals.ipairs, (keyId, valueId, expression) =>
		luau.list.make(valueId, offset(keyId, -1), expression),
	),

	entries: (state, node, expression) => {
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		const valuesId = state.pushToVar(luau.array());

		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: ipairs(expression),
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

	some: makeSomeMethod(luau.globals.ipairs, (keyId, valueId, expression) =>
		luau.list.make(valueId, offset(keyId, -1), expression),
	),

	forEach: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.create(luau.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: luau.list.make(valueId, offset(keyId, -1), expression),
						}),
					}),
				),
			}),
		);

		return luau.nil();
	},

	map: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(luau.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: newValueId,
							index: keyId,
						}),
						operator: "=",
						right: luau.create(luau.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: luau.list.make(valueId, offset(keyId, -1), expression),
						}),
					}),
				),
			}),
		);

		return newValueId;
	},

	mapFiltered: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(luau.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const lengthId = state.pushToVar(luau.number(0));
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		const resultId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.VariableDeclaration, {
						left: resultId,
						right: luau.create(luau.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: luau.list.make(valueId, offset(keyId, -1), expression),
						}),
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
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.pairs,
					args: luau.list.make(expression),
				}),
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

	filter: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(luau.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const lengthId = state.pushToVar(luau.number(0));
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.create(luau.SyntaxKind.BinaryExpression, {
							left: luau.create(luau.SyntaxKind.CallExpression, {
								expression: callbackId,
								args: luau.list.make(valueId, offset(keyId, -1), expression),
							}),
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

	reduce: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);
		return createReduceMethod(state, node, expression, luau.number(1), luau.unary("#", expression), 1);
	},

	reduceRight: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);
		return createReduceMethod(state, node, expression, luau.unary("#", expression), luau.number(1), -1);
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
	push: (state, node, expression) => {
		if (node.arguments.length === 0) {
			return luau.unary("#", expression);
		}

		expression = state.pushToVarIfComplex(expression);

		const args = ensureTransformOrder(state, node.arguments);
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

	shift: (state, node, expression) =>
		luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.table.remove,
			args: luau.list.make(expression, luau.number(1)),
		}),

	unshift: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const args = ensureTransformOrder(state, node.arguments);

		for (let i = args.length - 1; i >= 0; i--) {
			const arg = args[i];
			state.prereq(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.create(luau.SyntaxKind.CallExpression, {
						expression: luau.globals.table.insert,
						args: luau.list.make(expression, luau.number(1), arg),
					}),
				}),
			);
		}

		return luau.unary("#", expression);
	},

	insert: (state, node, expression) => {
		const args = ensureTransformOrder(state, node.arguments);

		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.table.insert,
			args: luau.list.make(expression, offset(args[0], 1), args[1]),
		});
	},

	remove: (state, node, expression) =>
		luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.table.remove,
			args: luau.list.make(expression, offset(ensureTransformOrder(state, node.arguments)[0], 1)),
		}),

	unorderedRemove: (state, node, expression) => {
		const arg = transformExpression(state, node.arguments[0]);

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

	sort: (state, node, expression) => {
		const valueIsUsed = !isUsedAsStatement(node);
		if (valueIsUsed) {
			expression = state.pushToVarIfComplex(expression);
		}

		const args = luau.list.make<luau.Expression>(expression);
		if (node.arguments.length > 0) {
			const [argExp, argPrereqs] = state.capture(() => transformExpression(state, node.arguments[0]));
			state.prereqList(argPrereqs);
			luau.list.push(args, argExp);
		}

		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.table.sort,
					args,
				}),
			}),
		);

		return valueIsUsed ? expression : luau.nil();
	},
};

const READONLY_SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) =>
		luau.binary(
			luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.next,
				args: luau.list.make(expression),
			}),
			"==",
			luau.nil(),
		),

	size: (state, node, expression) => {
		if (isUsedAsStatement(node)) {
			return luau.nil();
		}

		const sizeId = state.pushToVar(luau.number(0));
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(luau.emptyId()),
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.pairs,
					args: luau.list.make(expression),
				}),
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

	has: (state, node, expression) => {
		const left = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: transformExpression(state, node.arguments[0]),
		});
		return luau.binary(left, "~=", luau.nil());
	},
};

const SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	delete: (state, node, expression) => {
		const valueIsUsed = !isUsedAsStatement(node);
		let valueExistedId: luau.TemporaryIdentifier;
		if (valueIsUsed) {
			valueExistedId = state.pushToVar(
				luau.create(luau.SyntaxKind.BinaryExpression, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: transformExpression(state, node.arguments[0]),
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
					index: transformExpression(state, node.arguments[0]),
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
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.pairs,
					args: luau.list.make(expression),
				}),
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

	forEach: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(valueId),
				expression: pairs(expression),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.create(luau.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: luau.list.make(valueId, valueId, expression),
						}),
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

	add: (state, node, expression) => {
		const valueIsUsed = !isUsedAsStatement(node);
		if (valueIsUsed) {
			expression = state.pushToVarIfComplex(expression);
		}
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: transformExpression(state, node.arguments[0]),
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

	forEach: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const keyId = luau.tempId();
		const valueId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: pairs(expression),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.create(luau.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: luau.list.make(valueId, keyId, expression),
						}),
					}),
				),
			}),
		);

		return luau.nil();
	},

	get: (state, node, expression) =>
		luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: transformExpression(state, node.arguments[0]),
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

	set: (state, node, expression) => {
		const [keyExp, valueExp] = ensureTransformOrder(state, node.arguments);
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
	then: (state, node, expression) =>
		luau.create(luau.SyntaxKind.MethodCallExpression, {
			expression: convertToIndexableExpression(expression),
			name: "andThen",
			args: luau.list.make(...ensureTransformOrder(state, node.arguments)),
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
			expression: luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.pairs,
				args: luau.list.make(expression),
			}),
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

	isEmpty: (state, node, expression) =>
		luau.binary(
			luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.next,
				args: luau.list.make(transformExpression(state, node.arguments[0])),
			}),
			"==",
			luau.nil(),
		),

	keys: (state, node, expression) => {
		expression = transformExpression(state, node.arguments[0]);
		const keyId = luau.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [keyId], keyId);
	},

	values: (state, node, expression) => {
		expression = transformExpression(state, node.arguments[0]);
		const valueId = luau.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [luau.emptyId(), valueId], valueId);
	},

	entries: (state, node, expression) => {
		expression = transformExpression(state, node.arguments[0]);
		const ids = [luau.tempId(), luau.tempId()];
		return createKeyValuesEntriesMethod(state, node, expression, ids, luau.array(ids));
	},

	copy: makeCopyMethod(luau.globals.pairs, (state, node, expression) =>
		transformExpression(state, node.arguments[0]),
	),
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
	return (state, callNode, callExp) => {
		const [expression, prereqs] = state.capture(() => callback(state, callNode, callExp));

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
