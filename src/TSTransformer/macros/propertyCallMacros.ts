import ts from "byots";
import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { skipUpwards } from "TSTransformer/util/skipUpwards";

function offset(expression: lua.Expression, value: number) {
	return lua.create(lua.SyntaxKind.BinaryExpression, {
		left: expression,
		operator: value > 0 ? "+" : "-",
		right: lua.number(Math.abs(value)),
	});
}

function makeMathMethod(operator: lua.BinaryOperator): PropertyCallMacro {
	return (state, node, expression) => {
		const { expression: right, statements } = state.capturePrereqs(() =>
			transformExpression(state, node.arguments[0]),
		);
		const left = lua.list.isEmpty(statements) ? expression : state.pushToVar(expression);
		state.prereqList(statements);
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left,
			operator,
			right: lua.isBinaryExpression(right)
				? lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression: right })
				: right,
		});
	};
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

const size: PropertyCallMacro = (state, node, expression) =>
	lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression });

function stringMatchCallback(pattern: string): PropertyCallMacro {
	return (state, node, expression) =>
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.string.match,
			args: lua.list.make(expression, lua.string(pattern)),
		});
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

function makeEveryMethod(
	iterator: lua.Identifier,
	callbackArgsListMaker: (
		keyId: lua.TemporaryIdentifier,
		valueId: lua.TemporaryIdentifier,
		expression: lua.Expression,
	) => lua.List<lua.Expression>,
): PropertyCallMacro {
	return (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(lua.bool(true));
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));

		const firstId = lua.tempId();
		const secondId = lua.tempId();

		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(firstId, secondId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: iterator,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.UnaryExpression, {
							operator: "not",
							expression: lua.create(lua.SyntaxKind.CallExpression, {
								expression: callbackId,
								args: callbackArgsListMaker(firstId, secondId, expression),
							}),
						}),
						statements: lua.list.make<lua.Statement>(
							lua.create(lua.SyntaxKind.Assignment, {
								left: resultId,
								right: lua.bool(false),
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

const ARRAY_LIKE_METHODS: MacroList<PropertyCallMacro> = {
	size,
};

const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) =>
		lua.create(lua.SyntaxKind.BinaryExpression, {
			left: lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression }),
			operator: "==",
			right: lua.number(0),
		}),

	join: (state, node, expression) => {
		const separator = node.arguments.length > 0 ? transformExpression(state, node.arguments[0]) : lua.string(", ");
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.concat,
			args: lua.list.make(expression, separator),
		});
	},

	every: makeEveryMethod(lua.globals.ipairs, (keyId, valueId, expression) => {
		return lua.list.make(valueId, offset(keyId, -1), expression);
	}),

	some: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);
		const resultId = state.pushToVar(lua.bool(false));
		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const keyId = lua.tempId();
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.IfStatement, {
						condition: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, offset(keyId, -1), expression),
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

	forEach: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));

		const keyId = lua.tempId();
		const valueId = lua.tempId();

		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(keyId, valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
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
		return lua.emptyId();
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
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
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
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
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
								right: lua.create(lua.SyntaxKind.BinaryExpression, {
									left: lengthId,
									operator: "+",
									right: lua.number(1),
								}),
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

	reverse: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const resultId = state.pushToVar(lua.map());
		const lengthId = state.pushToVar(lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression }));

		const idxId = lua.tempId();

		state.prereq(
			lua.create(lua.SyntaxKind.NumericForStatement, {
				id: idxId,
				min: lua.number(1),
				max: lengthId,
				step: undefined,
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: resultId,
							index: idxId,
						}),
						right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: lua.create(lua.SyntaxKind.BinaryExpression, {
								left: lengthId,
								operator: "+",
								right: lua.create(lua.SyntaxKind.BinaryExpression, {
									left: lua.number(1),
									operator: "-",
									right: idxId,
								}),
							}),
						}),
					}),
				),
			}),
		);

		return resultId;
	},
};

const ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	push: (state, node, expression) => {
		if (node.arguments.length === 0) {
			return lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression });
		}

		expression = state.pushToVarIfComplex(expression);

		const args = ensureTransformOrder(state, node.arguments);

		const sizeId = state.pushToVar(
			lua.create(lua.SyntaxKind.UnaryExpression, {
				operator: "#",
				expression,
			}),
		);

		for (let i = 0; i < args.length; i++) {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index:
							i == 0
								? sizeId
								: lua.create(lua.SyntaxKind.BinaryExpression, {
										left: sizeId,
										operator: "+",
										right: lua.number(i),
								  }),
					}),
					right: args[i],
				}),
			);
		}

		if (!ts.isExpressionStatement(skipUpwards(node.parent))) {
			return lua.create(lua.SyntaxKind.BinaryExpression, {
				left: sizeId,
				operator: "+",
				right: lua.number(args.length),
			});
		} else {
			return lua.emptyId();
		}
	},

	pop: (state, node, expression) => {
		let sizeExp: lua.Expression = lua.create(lua.SyntaxKind.UnaryExpression, {
			operator: "#",
			expression,
		});

		const valueIsUsed = !ts.isExpressionStatement(skipUpwards(node.parent));
		const retValue = valueIsUsed ? lua.tempId() : lua.emptyId();

		if (valueIsUsed) {
			sizeExp = state.pushToVar(sizeExp);
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: retValue,
					right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: sizeExp,
					}),
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

		return retValue;
	},
};

const READONLY_SET_METHODS: MacroList<PropertyCallMacro> = {
	every: makeEveryMethod(lua.globals.pairs, (firstId, secondId, expression) => {
		return lua.list.make(firstId, expression);
	}),
};

const SET_METHODS: MacroList<PropertyCallMacro> = {};

const READONLY_MAP_METHODS: MacroList<PropertyCallMacro> = {
	every: makeEveryMethod(lua.globals.pairs, (keyId, valueId, expression) => {
		return lua.list.make(valueId, keyId, expression);
	}),
};

const MAP_METHODS: MacroList<PropertyCallMacro> = {};

export const PROPERTY_CALL_MACROS: { [className: string]: MacroList<PropertyCallMacro> } = {
	// math classes
	CFrame: {
		add: makeMathMethod("+"),
		sub: makeMathMethod("-"),
		mul: makeMathMethod("*"),
	},
	UDim: {
		add: makeMathMethod("+"),
		sub: makeMathMethod("-"),
	},
	UDim2: {
		add: makeMathMethod("+"),
		sub: makeMathMethod("-"),
	},
	Vector2: {
		add: makeMathMethod("+"),
		sub: makeMathMethod("-"),
		mul: makeMathMethod("*"),
		div: makeMathMethod("/"),
	},
	Vector2int16: {
		add: makeMathMethod("+"),
		sub: makeMathMethod("-"),
		mul: makeMathMethod("*"),
		div: makeMathMethod("/"),
	},
	Vector3: {
		add: makeMathMethod("+"),
		sub: makeMathMethod("-"),
		mul: makeMathMethod("*"),
		div: makeMathMethod("/"),
	},
	Vector3int16: {
		add: makeMathMethod("+"),
		sub: makeMathMethod("-"),
		mul: makeMathMethod("*"),
		div: makeMathMethod("/"),
	},

	String: STRING_CALLBACKS,
	ArrayLike: ARRAY_LIKE_METHODS,
	ReadonlyArray: READONLY_ARRAY_METHODS,
	Array: ARRAY_METHODS,
	ReadonlySet: READONLY_SET_METHODS,
	Set: SET_METHODS,
	WeakSet: SET_METHODS,
	ReadonlyMap: READONLY_MAP_METHODS,
	Map: MAP_METHODS,
	WeakMap: MAP_METHODS,
};
