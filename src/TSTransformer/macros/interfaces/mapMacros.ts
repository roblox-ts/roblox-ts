import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { SET_MAP_SHARED_METHODS } from "TSTransformer/macros/interfaces/setMapSharedMacros";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";

export const MAP_METHODS: MacroList<PropertyCallMacro> = {
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
