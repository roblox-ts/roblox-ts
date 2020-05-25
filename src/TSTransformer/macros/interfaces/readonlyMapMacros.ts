import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { READONLY_SET_MAP_SHARED_METHODS } from "TSTransformer/macros/interfaces/readonlySetMapSharedMacros";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { runtimeLib } from "TSTransformer/util/commonTrees";

export const READONLY_MAP_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	get: (state, node, expression) =>
		lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: transformExpression(state, node.arguments[0]),
		}),

	values: runtimeLib("Object_values"),
};
