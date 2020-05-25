import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

export const PROMISE_METHODS: MacroList<PropertyCallMacro> = {
	then: (state, node, expression) =>
		lua.create(lua.SyntaxKind.MethodCallExpression, {
			expression: convertToIndexableExpression(expression),
			name: "andThen",
			args: lua.list.make(...ensureTransformOrder(state, node.arguments)),
		}),
};
