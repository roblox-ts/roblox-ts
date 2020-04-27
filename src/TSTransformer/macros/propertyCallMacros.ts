import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { pushToVar, pushToVarIfComplex } from "TSTransformer/util/pushToVar";
import { skipUpwards } from "TSTransformer/util/skipUpwards";
import ts from "typescript";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

function makeMathMethod(operator: lua.BinaryOperator): PropertyCallMacro {
	return (state, node, expression) => {
		const { expression: right, statements } = state.capturePrereqs(() =>
			transformExpression(state, node.arguments[0]),
		);
		const left = lua.list.isEmpty(statements) ? expression : pushToVar(state, expression);
		state.prereqList(statements);
		return lua.create(lua.SyntaxKind.BinaryExpression, { left, operator, right });
	};
}

const READONLY_ARRAY_METHODS: MacroList<PropertyCallMacro> = {
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
					expression: lua.id("ipairs"),
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
};

const ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	push: (state, node, expression) => {
		if (node.arguments.length === 0) {
			return lua.create(lua.SyntaxKind.UnaryExpression, {
				operator: "#",
				expression,
			});
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
						expression,
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

	Array: ARRAY_METHODS,
	ReadonlyArray: READONLY_ARRAY_METHODS,
	Set: SET_METHODS,
	WeakSet: SET_METHODS,
	Map: MAP_METHODS,
	WeakMap: MAP_METHODS,
};
