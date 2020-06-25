import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { offset } from "TSTransformer/util/offset";

function wrapParenthesesIfBinary(expression: lua.Expression) {
	if (lua.isBinaryExpression(expression)) {
		return lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression });
	}
	return expression;
}

function ipairs(expression: lua.Expression): lua.Expression {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.ipairs,
		args: lua.list.make(expression),
	});
}

function runtimeLib(name: string, isStatic = false): PropertyCallMacro {
	return (state, node, expression) => {
		const args = lua.list.make(...ensureTransformOrder(state, node.arguments));
		if (!isStatic) {
			lua.list.unshift(args, expression);
		}
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS(name),
			args,
		});
	};
}

function makeMathMethod(operator: lua.BinaryOperator): PropertyCallMacro {
	return (state, node, expression) => {
		const [right, preqreqs] = state.capture(() => transformExpression(state, node.arguments[0]));
		const left = lua.list.isEmpty(preqreqs) ? expression : state.pushToVar(expression);
		state.prereqList(preqreqs);
		return lua.binary(wrapParenthesesIfBinary(left), operator, wrapParenthesesIfBinary(right));
	};
}

const OPERATOR_TO_NAME_MAP = new Map<lua.BinaryOperator, "add" | "sub" | "mul" | "div">([
	["+", "add"],
	["-", "sub"],
	["*", "mul"],
	["/", "div"],
]);

function makeMathSet(...operators: Array<lua.BinaryOperator>) {
	const result: { [index: string]: PropertyCallMacro } = {};
	for (const operator of operators) {
		const methodName = OPERATOR_TO_NAME_MAP.get(operator);
		assert(methodName);
		result[methodName] = makeMathMethod(operator);
	}
	return result;
}

function offsetArguments(args: Array<lua.Expression>, argOffsets: Array<number>) {
	const minLength = Math.min(args.length, argOffsets.length);
	for (let i = 0; i < minLength; i++) {
		const offsetValue = argOffsets[i];
		if (offsetValue !== 0) {
			const arg = args[i];
			if (lua.isNumberLiteral(arg)) {
				args[i] = lua.number(arg.value + offsetValue);
			} else {
				args[i] = offset(arg, offsetValue);
			}
		}
	}
	return args;
}

function makeStringCallback(
	strCallback: lua.PropertyAccessExpression,
	argOffsets: Array<number> = [],
): PropertyCallMacro {
	return (state, node, expression) => {
		const args = offsetArguments(ensureTransformOrder(state, node.arguments), argOffsets);
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: strCallback,
			args: lua.list.make(expression, ...args),
		});
	};
}

function makeFindMethod(initialValue: lua.Expression, returnValue: boolean): PropertyCallMacro {
	return (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const loopId = lua.tempId();
		const valueId = lua.tempId();
		const returnId = state.pushToVar(initialValue);

		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				expression: ipairs(expression),
				ids: lua.list.make(loopId, valueId),
				statements: lua.list.make<lua.Statement>(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: lua.create(lua.SyntaxKind.CallExpression, {
								expression: callbackId,
								args: lua.list.make(valueId, offset(loopId, -1), expression),
							}),
							operator: "==",
							right: lua.bool(true),
						}),
						statements: lua.list.make<lua.Statement>(
							lua.create(lua.SyntaxKind.Assignment, {
								left: returnId,
								right: returnValue ? valueId : loopId,
							}),
							lua.create(lua.SyntaxKind.BreakStatement, {}),
						),
						elseBody: lua.list.make(),
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
	expression: lua.Expression,
	start: lua.Expression,
	end: lua.Expression,
	step: number,
): lua.Expression {
	const args = ensureTransformOrder(state, node.arguments);

	const lengthExp = lua.unary("#", expression);

	let resultId;
	// if there was no initialValue supplied
	if (args.length < 2) {
		state.prereq(
			lua.create(lua.SyntaxKind.IfStatement, {
				condition: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: lengthExp,
					operator: "==",
					right: lua.number(0),
				}),
				statements: lua.list.make<lua.Statement>(
					lua.create(lua.SyntaxKind.CallStatement, {
						expression: lua.create(lua.SyntaxKind.CallExpression, {
							expression: lua.globals.error,
							args: lua.list.make(
								lua.string(
									"Attempted to call `ReadonlyArray.reduce()` on an empty array without an initialValue.",
								),
							),
						}),
					}),
				),
				elseBody: lua.list.make(),
			}),
		);
		resultId = state.pushToVar(
			lua.create(lua.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(expression),
				index: start,
			}),
		);
		start = offset(start, step);
	} else {
		resultId = state.pushToVar(args[1]);
	}
	const callbackId = state.pushToVar(args[0]);

	const iteratorId = lua.tempId();
	state.prereq(
		lua.create(lua.SyntaxKind.NumericForStatement, {
			id: iteratorId,
			start,
			end,
			step: step === 1 ? undefined : lua.number(step),
			statements: lua.list.make(
				lua.create(lua.SyntaxKind.Assignment, {
					left: resultId,
					right: lua.create(lua.SyntaxKind.CallExpression, {
						expression: callbackId,
						args: lua.list.make(
							resultId,
							lua.create(lua.SyntaxKind.ComputedIndexExpression, {
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

const size: PropertyCallMacro = (state, node, expression) => lua.unary("#", expression);

function stringMatchCallback(pattern: string): PropertyCallMacro {
	return (state, node, expression) =>
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.string.match,
			args: lua.list.make(expression, lua.string(pattern)),
		});
}

function makeCopyMethod(iterator: lua.Identifier, makeExpression: PropertyCallMacro): PropertyCallMacro {
	return (state, node, expression) => {
		const arrayCopyId = state.pushToVar(lua.map());
		const valueId = lua.tempId();
		const keyId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: iterator,
					args: lua.list.make(makeExpression(state, node, expression)),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: arrayCopyId,
							index: keyId,
						}),
						right: valueId,
					}),
				),
			}),
		);

		return arrayCopyId;
	};
}

const findMacro = makeStringCallback(lua.globals.string.find, [0, 1]);

const STRING_CALLBACKS: MacroList<PropertyCallMacro> = {
	size,
	trim: stringMatchCallback("^%s*(.-)%s*$"),
	trimStart: stringMatchCallback("^%s*(.-)$"),
	trimEnd: stringMatchCallback("^(.-)%s*$"),
	split: makeStringCallback(lua.globals.string.split),
	slice: makeStringCallback(lua.globals.string.sub, [1, 0]),
	sub: makeStringCallback(lua.globals.string.sub, [1, 1]),
	byte: makeStringCallback(lua.globals.string.byte, [1, 1]),
	format: makeStringCallback(lua.globals.string.format),
	find: (state, node, expression) =>
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS("string_find_wrap"),
			args: lua.list.make(findMacro(state, node, expression)),
		}),
};

function makeEveryOrSomeMethod(
	iterator: lua.Identifier,
	callbackArgsListMaker: (
		keyId: lua.TemporaryIdentifier,
		valueId: lua.TemporaryIdentifier,
		expression: lua.Expression,
	) => lua.List<lua.Expression>,
	initialState: boolean,
): PropertyCallMacro {
	return (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(lua.bool(initialState));
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));

		const keyId = lua.tempId();
		const valueId = lua.tempId();

		const callCallback = lua.create(lua.SyntaxKind.CallExpression, {
			expression: callbackId,
			args: callbackArgsListMaker(keyId, valueId, expression),
		});
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: iterator,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: initialState ? lua.unary("not", callCallback) : callCallback,
						statements: lua.list.make<lua.Statement>(
							lua.create(lua.SyntaxKind.Assignment, {
								left: resultId,
								right: lua.bool(!initialState),
							}),
							lua.create(lua.SyntaxKind.BreakStatement, {}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return resultId;
	};
}

function makeEveryMethod(
	iterator: lua.Identifier,
	callbackArgsListMaker: (
		keyId: lua.TemporaryIdentifier,
		valueId: lua.TemporaryIdentifier,
		expression: lua.Expression,
	) => lua.List<lua.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(iterator, callbackArgsListMaker, true);
}

function makeSomeMethod(
	iterator: lua.Identifier,
	callbackArgsListMaker: (
		keyId: lua.TemporaryIdentifier,
		valueId: lua.TemporaryIdentifier,
		expression: lua.Expression,
	) => lua.List<lua.Expression>,
): PropertyCallMacro {
	return makeEveryOrSomeMethod(iterator, callbackArgsListMaker, false);
}

function argumentsWithDefaults(
	state: TransformState,
	args: ts.NodeArray<ts.Expression>,
	defaults: Array<lua.Expression>,
): Array<lua.Expression> {
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
	isEmpty: (state, node, expression) => lua.binary(lua.unary("#", expression), "==", lua.number(0)),

	// toString - likely to be dropped for @rbxts/inspect

	concat: (state, node, expression) => {
		const resultId = state.pushToVar(lua.array());

		const args = ensureTransformOrder(state, node.arguments);
		args.unshift(expression);

		const sizeId = state.pushToVar(lua.number(1));
		for (const arg of args) {
			const valueId = lua.tempId();
			state.prereq(
				lua.create(lua.SyntaxKind.ForStatement, {
					ids: lua.list.make<lua.AnyIdentifier>(lua.emptyId(), valueId),
					expression: ipairs(arg),
					statements: lua.list.make(
						lua.create(lua.SyntaxKind.Assignment, {
							left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: resultId,
								index: sizeId,
							}),
							right: valueId,
						}),
						lua.create(lua.SyntaxKind.Assignment, {
							left: sizeId,
							right: offset(sizeId, 1),
						}),
					),
				}),
			);
		}

		return resultId;
	},

	join: (state, node, expression) => {
		const args = argumentsWithDefaults(state, node.arguments, [lua.strings[", "]]);

		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.concat,
			args: lua.list.make(expression, args[0]),
		});
	},

	slice: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const lengthOfExpression = lua.unary("#", expression);
		const args = argumentsWithDefaults(state, node.arguments, [lua.number(0), lengthOfExpression]);

		// returns the value of a 'NegativeLiteral'
		// however, those do not exist
		// so this function will check to see if:
		//		exp is a UnaryExpression
		//		the expression of exp is a NumberLiteral
		//		the operator is unary minus
		// then return the value of that literal
		const getValueFromNegativeLiteral = (exp: lua.Expression) =>
			lua.isUnaryExpression(exp) && lua.isNumberLiteral(exp.expression) && exp.operator === "-"
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
			end = lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.math.min,
				args: lua.list.make(lengthOfExpression, end),
			});
		}

		const resultId = state.pushToVar(lua.array());

		const sizeId = state.pushToVar(lua.number(1));
		const iteratorId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.NumericForStatement, {
				id: iteratorId,
				start,
				end,
				step: undefined,
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: resultId,
							index: sizeId,
						}),
						right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: iteratorId,
						}),
					}),
					lua.create(lua.SyntaxKind.Assignment, {
						left: sizeId,
						right: offset(sizeId, 1),
					}),
				),
			}),
		);

		return resultId;
	},

	includes: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const nodeArgs = ensureTransformOrder(state, node.arguments);
		const startIndex = offset(nodeArgs.length > 1 ? nodeArgs[1] : lua.number(0), 1);

		const resultId = state.pushToVar(lua.bool(false));

		const iteratorId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.NumericForStatement, {
				id: iteratorId,
				start: startIndex,
				end: lua.unary("#", expression),
				step: undefined,
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: convertToIndexableExpression(expression),
								index: iteratorId,
							}),
							operator: "==",
							right: nodeArgs[0],
						}),
						statements: lua.list.make<lua.Statement>(
							lua.create(lua.SyntaxKind.Assignment, {
								left: resultId,
								right: lua.bool(true),
							}),
							lua.create(lua.SyntaxKind.BreakStatement, {}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return resultId;
	},

	indexOf: (state, node, expression) => {
		const nodeArgs = ensureTransformOrder(state, node.arguments);
		const findArgs = lua.list.make(expression, nodeArgs[0]);

		if (nodeArgs.length > 1) {
			lua.list.push(findArgs, offset(nodeArgs[1], 1));
		}

		return lua.create(lua.SyntaxKind.ParenthesizedExpression, {
			expression: offset(
				lua.create(lua.SyntaxKind.ParenthesizedExpression, {
					expression: lua.create(lua.SyntaxKind.BinaryExpression, {
						left: lua.create(lua.SyntaxKind.CallExpression, {
							expression: lua.globals.table.find,
							args: findArgs,
						}),
						operator: "or",
						right: lua.number(0),
					}),
				}),
				-1,
			),
		});
	},

	lastIndexOf: (state, node, expression) => {
		const nodeArgs = ensureTransformOrder(state, node.arguments);

		const startExpression = nodeArgs.length > 1 ? offset(nodeArgs[1], 1) : lua.unary("#", expression);

		const result = state.pushToVar(lua.number(-1));
		const iterator = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.NumericForStatement, {
				id: iterator,
				start: startExpression,
				end: lua.number(1),
				step: lua.number(-1),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: convertToIndexableExpression(expression),
								index: iterator,
							}),
							operator: "==",
							right: nodeArgs[0],
						}),
						statements: lua.list.make<lua.Statement>(
							lua.create(lua.SyntaxKind.Assignment, {
								left: result,
								right: offset(iterator, -1),
							}),
							lua.create(lua.SyntaxKind.BreakStatement, {}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return result;
	},

	every: makeEveryMethod(lua.globals.ipairs, (keyId, valueId, expression) =>
		lua.list.make(valueId, offset(keyId, -1), expression),
	),

	entries: (state, node, expression) => {
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		const valuesId = state.pushToVar(lua.array());

		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(valuesId),
							index: keyId,
						}),
						right: lua.array([offset(keyId, -1), valueId]),
					}),
				),
			}),
		);

		return valuesId;
	},

	some: makeSomeMethod(lua.globals.ipairs, (keyId, valueId, expression) =>
		lua.list.make(valueId, offset(keyId, -1), expression),
	),

	forEach: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.CallStatement, {
						expression: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, offset(keyId, -1), expression),
						}),
					}),
				),
			}),
		);

		return lua.nil();
	},

	map: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(lua.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: newValueId,
							index: keyId,
						}),
						right: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, offset(keyId, -1), expression),
						}),
					}),
				),
			}),
		);

		return newValueId;
	},

	mapFiltered: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(lua.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const lengthId = state.pushToVar(lua.number(0));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		const resultId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: lua.list.make<lua.Statement>(
					lua.create(lua.SyntaxKind.VariableDeclaration, {
						left: resultId,
						right: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, offset(keyId, -1), expression),
						}),
					}),
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.binary(resultId, "~=", lua.nil()),
						statements: lua.list.make(
							lua.create(lua.SyntaxKind.Assignment, {
								left: lengthId,
								right: lua.binary(lengthId, "+", lua.number(1)),
							}),
							lua.create(lua.SyntaxKind.Assignment, {
								left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
									expression: newValueId,
									index: lengthId,
								}),
								right: resultId,
							}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return newValueId;
	},

	filterUndefined: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const lengthId = state.pushToVar(lua.number(0));
		const indexId1 = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(indexId1),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.pairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.binary(indexId1, ">", lengthId),
						statements: lua.list.make(
							lua.create(lua.SyntaxKind.Assignment, {
								left: lengthId,
								right: indexId1,
							}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		const resultId = state.pushToVar(lua.array());
		const resultLengthId = state.pushToVar(lua.number(0));
		const indexId2 = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.NumericForStatement, {
				id: indexId2,
				start: lua.number(1),
				end: lengthId,
				step: undefined,

				statements: lua.list.make<lua.Statement>(
					lua.create(lua.SyntaxKind.VariableDeclaration, {
						left: valueId,
						right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: indexId2,
						}),
					}),
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.binary(valueId, "~=", lua.nil()),
						statements: lua.list.make(
							lua.create(lua.SyntaxKind.Assignment, {
								left: resultLengthId,
								right: lua.binary(resultLengthId, "+", lua.number(1)),
							}),
							lua.create(lua.SyntaxKind.Assignment, {
								left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
									expression: resultId,
									index: resultLengthId,
								}),
								right: valueId,
							}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return resultId;
	},

	filter: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const newValueId = state.pushToVar(lua.array());
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const lengthId = state.pushToVar(lua.number(0));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: ipairs(expression),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: lua.create(lua.SyntaxKind.CallExpression, {
								expression: callbackId,
								args: lua.list.make(valueId, offset(keyId, -1), expression),
							}),
							operator: "==",
							right: lua.bool(true),
						}),
						statements: lua.list.make(
							lua.create(lua.SyntaxKind.Assignment, {
								left: lengthId,
								right: lua.binary(lengthId, "+", lua.number(1)),
							}),
							lua.create(lua.SyntaxKind.Assignment, {
								left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
									expression: newValueId,
									index: lengthId,
								}),
								right: valueId,
							}),
						),
						elseBody: lua.list.make(),
					}),
				),
			}),
		);

		return newValueId;
	},

	reduce: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);
		return createReduceMethod(state, node, expression, lua.number(1), lua.unary("#", expression), 1);
	},

	reduceRight: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);
		return createReduceMethod(state, node, expression, lua.unary("#", expression), lua.number(1), -1);
	},

	reverse: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(lua.map());
		const lengthId = state.pushToVar(lua.unary("#", expression));
		const idxId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.NumericForStatement, {
				id: idxId,
				start: lua.number(1),
				end: lengthId,
				step: undefined,
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: resultId,
							index: idxId,
						}),
						right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: lua.binary(lengthId, "+", lua.binary(lua.number(1), "-", idxId)),
						}),
					}),
				),
			}),
		);

		return resultId;
	},

	// entries

	find: makeFindMethod(lua.nil(), true),

	findIndex: makeFindMethod(lua.number(-1), false),

	copy: makeCopyMethod(lua.globals.ipairs, (state, node, expression) => expression),
};

const ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	push: (state, node, expression) => {
		if (node.arguments.length === 0) {
			return lua.unary("#", expression);
		}

		expression = state.pushToVarIfComplex(expression);

		const args = ensureTransformOrder(state, node.arguments);

		let sizeExp: lua.Expression = lua.unary("#", expression);

		if (args.length > 1) {
			sizeExp = state.pushToVar(sizeExp);
		}

		for (let i = 0; i < args.length; i++) {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: lua.binary(sizeExp, "+", lua.number(i + 1)),
					}),
					right: args[i],
				}),
			);
		}

		if (!isUsedAsStatement(node)) {
			return lua.binary(sizeExp, "+", lua.number(args.length));
		} else {
			return lua.nil();
		}
	},

	pop: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		let sizeExp: lua.Expression = lua.unary("#", expression);

		const valueIsUsed = !isUsedAsStatement(node);
		let retValue: lua.TemporaryIdentifier;
		if (valueIsUsed) {
			sizeExp = state.pushToVar(sizeExp);
			retValue = state.pushToVar(
				lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: sizeExp,
				}),
			);
		}

		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: sizeExp,
				}),
				right: lua.nil(),
			}),
		);

		return valueIsUsed ? retValue! : lua.nil();
	},

	shift: (state, node, expression) =>
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.remove,
			args: lua.list.make(expression, lua.number(1)),
		}),

	unshift: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const args = ensureTransformOrder(state, node.arguments);

		for (let i = args.length - 1; i >= 0; i--) {
			const arg = args[i];
			state.prereq(
				lua.create(lua.SyntaxKind.CallStatement, {
					expression: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.globals.table.insert,
						args: lua.list.make(expression, lua.number(1), arg),
					}),
				}),
			);
		}

		return lua.unary("#", expression);
	},

	insert: (state, node, expression) => {
		const args = ensureTransformOrder(state, node.arguments);

		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.insert,
			args: lua.list.make(expression, offset(args[0], 1), args[1]),
		});
	},

	remove: (state, node, expression) =>
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.remove,
			args: lua.list.make(expression, offset(ensureTransformOrder(state, node.arguments)[0], 1)),
		}),

	unorderedRemove: (state, node, expression) => {
		const arg = transformExpression(state, node.arguments[0]);

		expression = state.pushToVarIfComplex(expression);

		const lengthId = state.pushToVar(lua.unary("#", expression));

		const valueIsUsed = !isUsedAsStatement(node);
		let valueId: lua.TemporaryIdentifier;
		if (valueIsUsed) {
			valueId = state.pushToVar(
				lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: offset(arg, 1),
				}),
			);
		}

		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: offset(arg, 1),
				}),
				right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthId,
				}),
			}),
		);

		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: lengthId,
				}),
				right: lua.nil(),
			}),
		);

		return valueIsUsed ? valueId! : lua.nil();
	},

	sort: (state, node, expression) => {
		const valueIsUsed = !isUsedAsStatement(node);
		if (valueIsUsed) {
			expression = state.pushToVarIfComplex(expression);
		}

		const args = lua.list.make<lua.Expression>(expression);
		if (node.arguments.length > 0) {
			const [argExp, argPrereqs] = state.capture(() => transformExpression(state, node.arguments[0]));
			state.prereqList(argPrereqs);
			lua.list.push(args, argExp);
		}

		state.prereq(
			lua.create(lua.SyntaxKind.CallStatement, {
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.table.sort,
					args,
				}),
			}),
		);

		return valueIsUsed ? expression : lua.nil();
	},
};

const READONLY_SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) => {
		const left = lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.next,
			args: lua.list.make(expression),
		});
		return lua.binary(left, "==", lua.nil());
	},

	size: (state, node, expression) => {
		if (isUsedAsStatement(node)) {
			return lua.nil();
		}

		const sizeId = state.pushToVar(lua.number(0));
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(lua.emptyId()),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.pairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: sizeId,
						right: lua.binary(sizeId, "+", lua.number(1)),
					}),
				),
			}),
		);
		return sizeId;
	},

	has: (state, node, expression) => {
		const left = lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: transformExpression(state, node.arguments[0]),
		});
		return lua.binary(left, "~=", lua.nil());
	},
};

const SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	delete: (state, node, expression) => {
		const valueIsUsed = !isUsedAsStatement(node);
		let valueExistedId: lua.TemporaryIdentifier;
		if (valueIsUsed) {
			valueExistedId = state.pushToVar(
				lua.create(lua.SyntaxKind.BinaryExpression, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: transformExpression(state, node.arguments[0]),
					}),
					operator: "~=",
					right: lua.nil(),
				}),
			);
		}

		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: transformExpression(state, node.arguments[0]),
				}),
				right: lua.nil(),
			}),
		);

		return valueIsUsed ? valueExistedId! : lua.nil();
	},

	clear: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);
		const keyId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.pairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: keyId,
						}),
						right: lua.nil(),
					}),
				),
			}),
		);
		return lua.nil();
	},
};

const READONLY_SET_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	forEach: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(valueId),
				expression: ipairs(expression),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.CallStatement, {
						expression: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, valueId, expression),
						}),
					}),
				),
			}),
		);

		return lua.nil();
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
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: transformExpression(state, node.arguments[0]),
				}),
				right: lua.bool(true),
			}),
		);
		return valueIsUsed ? expression : lua.nil();
	},
};

const READONLY_MAP_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	get: (state, node, expression) =>
		lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: transformExpression(state, node.arguments[0]),
		}),

	entries: (state, node, expression) => {
		const ids = [lua.tempId(), lua.tempId()];
		return createKeyValuesEntriesMethod(state, node, expression, ids, lua.array(ids));
	},

	keys: (state, node, expression) => {
		const keyId = lua.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [keyId], keyId);
	},

	values: (state, node, expression) => {
		const valueId = lua.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [lua.emptyId(), valueId], valueId);
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
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: keyExp,
				}),
				right: valueExp,
			}),
		);
		return valueIsUsed ? expression : lua.nil();
	},
};

const PROMISE_METHODS: MacroList<PropertyCallMacro> = {
	then: (state, node, expression) =>
		lua.create(lua.SyntaxKind.MethodCallExpression, {
			expression: convertToIndexableExpression(expression),
			name: "andThen",
			args: lua.list.make(...ensureTransformOrder(state, node.arguments)),
		}),
};

function createKeyValuesEntriesMethod(
	state: TransformState,
	node: ts.CallExpression,
	expression: lua.Expression,
	ids: Array<lua.AnyIdentifier>,
	right: lua.Expression,
) {
	const valuesId = state.pushToVar(lua.array());
	const iterId = state.pushToVar(lua.number(0));

	state.prereq(
		lua.create(lua.SyntaxKind.ForStatement, {
			ids: lua.list.make(...ids),
			expression: lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.pairs,
				args: lua.list.make(expression),
			}),
			statements: lua.list.make(
				lua.create(lua.SyntaxKind.Assignment, {
					left: iterId,
					right: lua.binary(iterId, "+", lua.number(1)),
				}),
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(valuesId),
						index: iterId,
					}),
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
	isEmpty: runtimeLib("Object_isEmpty", true),

	keys: (state, node, expression) => {
		expression = transformExpression(state, node.arguments[0]);
		const keyId = lua.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [keyId], keyId);
	},

	values: (state, node, expression) => {
		expression = transformExpression(state, node.arguments[0]);
		const valueId = lua.tempId();
		return createKeyValuesEntriesMethod(state, node, expression, [lua.emptyId(), valueId], valueId);
	},

	entries: (state, node, expression) => {
		expression = transformExpression(state, node.arguments[0]);
		const ids = [lua.tempId(), lua.tempId()];
		return createKeyValuesEntriesMethod(state, node, expression, ids, lua.array(ids));
	},

	copy: makeCopyMethod(lua.globals.pairs, (state, node, expression) => transformExpression(state, node.arguments[0])),
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
	return lua.comment(`▼ ${text} ▼`);
}

function footer(text: string) {
	return lua.comment(`▲ ${text} ▲`);
}

function wasExpressionPushed(statements: lua.List<lua.Statement>, expression: lua.Expression) {
	if (statements.head !== undefined) {
		const firstStatement = statements.head.value;
		if (lua.isVariableDeclaration(firstStatement)) {
			if (!lua.list.isList(firstStatement.left) && lua.isTemporaryIdentifier(firstStatement.left)) {
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

		let size = lua.list.size(prereqs);
		if (size > 0) {
			// detect the case of `expression = state.pushToVarIfComplex(expression);` and put header after
			const wasPushed = wasExpressionPushed(prereqs, callExp);
			let pushStatement: lua.Statement | undefined;
			if (wasPushed) {
				pushStatement = lua.list.shift(prereqs);
				size--;
			}
			if (size > 0) {
				lua.list.unshift(prereqs, header(methodName));
				if (wasPushed && pushStatement) {
					lua.list.unshift(prereqs, pushStatement);
				}
				lua.list.push(prereqs, footer(methodName));
			} else {
				if (wasPushed && pushStatement) {
					lua.list.unshift(prereqs, pushStatement);
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
