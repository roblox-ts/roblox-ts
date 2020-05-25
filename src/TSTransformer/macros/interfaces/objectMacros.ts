import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { runtimeLib, makeCopyMethod, makeKeysValuesEntriesMethod } from "TSTransformer/util/commonTrees";

export const OBJECT_METHODS: MacroList<PropertyCallMacro> = {
	assign: runtimeLib("Object_assign", true),
	deepCopy: runtimeLib("Object_deepCopy", true),
	deepEquals: runtimeLib("Object_deepEquals", true),
	fromEntries: runtimeLib("Object_fromEntries", true),
	isEmpty: runtimeLib("Object_isEmpty", true),

	keys: makeKeysValuesEntriesMethod([lua.tempId()], key => key),
	values: makeKeysValuesEntriesMethod([lua.emptyId(), lua.tempId()], (_, value) => value),
	entries: makeKeysValuesEntriesMethod([lua.tempId(), lua.tempId()], (key, value) => lua.array([key, value])),

	copy: makeCopyMethod(lua.globals.pairs, (state, node, expression) => transformExpression(state, node.arguments[0])),
};
