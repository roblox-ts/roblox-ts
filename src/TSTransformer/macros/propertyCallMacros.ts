import * as lua from "LuaAST";
import { Macro } from "TSTransformer/macros/types";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import ts from "typescript";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { tempId } from "LuaAST";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { pushToVarIfComplex, pushToVar } from "TSTransformer/util/pushToVar";

export type PropertyCallMacro = Macro<ts.CallExpression & { expression: ts.PropertyAccessExpression }, lua.Expression>;
export type PropertyCallMacroList = { [methodName: string]: PropertyCallMacro };

function makeMathMethod(operator: lua.BinaryOperator): PropertyCallMacro {
	return (state, node) => {
		const [left, right] = ensureTransformOrder(state, [node.expression, node.arguments[0]]);
		return lua.create(lua.SyntaxKind.BinaryExpression, { left, operator, right });
	};
}

const ARRAY_METHODS: PropertyCallMacroList = {
	push: (state, node) => {
		return lua.tempId();
	},
	pop: (state, node) => {
		const expression = pushToVarIfComplex(state, transformExpression(state, node.expression.expression));

		const valueIsUsed = !ts.isExpressionStatement(node.parent);

		let sizeExp: lua.Expression = lua.create(lua.SyntaxKind.UnaryExpression, {
			operator: "#",
			expression,
		});

		const retValue = valueIsUsed ? lua.tempId() : lua.emptyId();

		// local _0 = #x
		if (valueIsUsed) {
			const sizeId = pushToVar(state, sizeExp);
			sizeExp = sizeId;

			// local _1 = x[_0]
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: retValue,
					right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: sizeId,
					}),
				}),
			);
		}

		// x[_0] = nil
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: sizeExp,
				}),
				right: lua.nil(),
			}),
		);

		// _1
		return retValue;
	},
};

const SET_METHODS: PropertyCallMacroList = {};

const MAP_METHODS: PropertyCallMacroList = {};

export const PROPERTY_CALL_MACROS: { [className: string]: PropertyCallMacroList } = {
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
