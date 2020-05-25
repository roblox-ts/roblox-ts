import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { READONLY_SET_MAP_SHARED_METHODS } from "TSTransformer/macros/interfaces/readonlySetMapSharedMacros";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export const READONLY_SET_METHODS: MacroList<PropertyCallMacro> = {
	...READONLY_SET_MAP_SHARED_METHODS,

	forEach: (state, node, expression) => {
		expression = state.pushToVarIfComplex(expression);

		const callbackId = state.pushToVarIfComplex(transformExpression(state, node.arguments[0]));
		const valueId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.ForStatement, {
				ids: lua.list.make(valueId),
				expression: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.ipairs,
					args: lua.list.make(expression),
				}),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.CallStatement, {
						expression: lua.create(lua.SyntaxKind.CallExpression, {
							expression: callbackId,
							args: lua.list.make(valueId, valueId, expression),
						}),
					}),
				),
			}),
		);

		return lua.nil();
	},
};
