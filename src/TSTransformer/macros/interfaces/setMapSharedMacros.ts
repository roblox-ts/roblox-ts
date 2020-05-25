import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export const SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	delete: (state, node, expression) => {
		const valueIsUsed = !isUsedAsStatement(node);
		const valueExistedId = lua.tempId();
		if (valueIsUsed) {
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: valueExistedId,
					right: lua.create(lua.SyntaxKind.BinaryExpression, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: convertToIndexableExpression(expression),
							index: transformExpression(state, node.arguments[0]),
						}),
						operator: "~=",
						right: lua.nil(),
					}),
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

		return valueIsUsed ? valueExistedId : lua.nil();
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
