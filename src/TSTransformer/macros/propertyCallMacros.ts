import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { pushToVar, pushToVarIfComplex } from "TSTransformer/util/pushToVar";
import ts from "typescript";

function makeMathMethod(operator: lua.BinaryOperator): PropertyCallMacro {
	return (state, node) => {
		const [left, right] = ensureTransformOrder(state, [node.expression.expression, node.arguments[0]]);
		return lua.create(lua.SyntaxKind.BinaryExpression, { left, operator, right });
	};
}

const ARRAY_METHODS: MacroList<PropertyCallMacro> = {
	push: (state, node) => {
		return lua.tempId();
	},
	pop: (state, node) => {
		const expression = pushToVarIfComplex(state, transformExpression(state, node.expression.expression));

		let sizeExp: lua.Expression = lua.create(lua.SyntaxKind.UnaryExpression, {
			operator: "#",
			expression,
		});

		const valueIsUsed = !ts.isExpressionStatement(node.parent);
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
	Set: SET_METHODS,
	WeakSet: SET_METHODS,
	Map: MAP_METHODS,
	WeakMap: MAP_METHODS,
};
