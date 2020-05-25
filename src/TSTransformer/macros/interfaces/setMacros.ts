import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { SET_MAP_SHARED_METHODS } from "TSTransformer/macros/interfaces/setMapSharedMacros";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export const SET_METHODS: MacroList<PropertyCallMacro> = {
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
