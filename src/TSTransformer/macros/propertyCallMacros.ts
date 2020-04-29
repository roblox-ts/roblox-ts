import ts from "byots";
import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { pushToVar, pushToVarIfComplex } from "TSTransformer/util/pushToVar";
import { skipUpwards } from "TSTransformer/util/skipUpwards";
import { binaryExpressionChain } from "TSTransformer/util/binaryExpressionChain";

function makeMathMethod(operator: lua.BinaryOperator): PropertyCallMacro {
	return (state, node, expression) => {
		const { expression: right, statements } = state.capturePrereqs(() =>
			transformExpression(state, node.arguments[0]),
		);
		const left = lua.list.isEmpty(statements) ? expression : pushToVar(state, expression);
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

const ARRAY_LIKE_METHODS: MacroList<PropertyCallMacro> = {
	size: (state, node, expression) => lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression }),
};

const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) =>
		lua.create(lua.SyntaxKind.BinaryExpression, {
			left: lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression }),
			operator: "==",
			right: lua.number(0),
		}),

	join: (state, node, expression) => {
		const separator = node.arguments.length > 0 ? transformExpression(state, node.arguments[0]) : lua.string(",");
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.table.concat,
			args: lua.list.make(expression, separator),
		});
	},

	every: (state, node, expression) => {
		expression = pushToVarIfComplex(state, expression);

		const resultId = pushToVar(state, lua.bool(true));
		const callbackId = pushToVarIfComplex(state, transformExpression(state, node.arguments[0]));

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
						condition: lua.create(lua.SyntaxKind.UnaryExpression, {
							operator: "not",
							expression: lua.create(lua.SyntaxKind.CallExpression, {
								expression: callbackId,
								args: lua.list.make(valueId, keyId, expression),
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
	},

	some: (state, node, expression) => {
		expression = pushToVarIfComplex(state, expression);

		const resultId = pushToVar(state, lua.bool(false));
		const callbackId = pushToVarIfComplex(state, transformExpression(state, node.arguments[0]));

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
							args: lua.list.make(valueId, keyId, expression),
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

	map: (state, node, expression) => {
		expression = pushToVarIfComplex(state, expression);
		const newValueId = pushToVar(state, lua.array());
		const callbackId = pushToVarIfComplex(state, transformExpression(state, node.arguments[0]));
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
							args: lua.list.make(valueId, keyId, expression),
						}),
					}),
				),
			}),
		);
		return newValueId;
	},

	reverse: (state, node, expression) => {
		expression = pushToVarIfComplex(state, expression);

		const resultId = pushToVar(state, lua.map());
		const lengthId = pushToVar(state, lua.create(lua.SyntaxKind.UnaryExpression, { operator: "#", expression }));

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

		expression = pushToVarIfComplex(state, expression);

		const args = ensureTransformOrder(state, node.arguments);

		const sizeId = pushToVar(
			state,
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

		if (!ts.isExpressionStatement(skipUpwards(node))) {
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

		const valueIsUsed = !ts.isExpressionStatement(skipUpwards(node));
		const retValue = valueIsUsed ? lua.tempId() : lua.emptyId();

		if (valueIsUsed) {
			sizeExp = pushToVar(state, sizeExp);
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

const SET_METHODS: MacroList<PropertyCallMacro> = {};

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

	ArrayLike: ARRAY_LIKE_METHODS,
	ReadonlyArray: READONLY_ARRAY_METHODS,
	Array: ARRAY_METHODS,
	Set: SET_METHODS,
	WeakSet: SET_METHODS,
	Map: MAP_METHODS,
	WeakMap: MAP_METHODS,
};
