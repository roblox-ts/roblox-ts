import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export const READONLY_SET_MAP_SHARED_METHODS: MacroList<PropertyCallMacro> = {
	isEmpty: (state, node, expression) =>
		lua.create(lua.SyntaxKind.BinaryExpression, {
			left: lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.next,
				args: lua.list.make(expression),
			}),
			operator: "==",
			right: lua.nil(),
		}),

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
						right: lua.create(lua.SyntaxKind.BinaryExpression, {
							left: sizeId,
							operator: "+",
							right: lua.number(1),
						}),
					}),
				),
			}),
		);
		return sizeId;
	},

	has: (state, node, expression) =>
		lua.create(lua.SyntaxKind.BinaryExpression, {
			left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(expression),
				index: transformExpression(state, node.arguments[0]),
			}),
			operator: "~=",
			right: lua.nil(),
		}),
};
