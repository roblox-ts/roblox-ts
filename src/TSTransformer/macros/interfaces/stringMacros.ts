import * as lua from "LuaAST";
import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { size, stringMatchCallback, makeStringCallback } from "TSTransformer/util/commonTrees";

const findMacro = makeStringCallback(lua.globals.string.find, [0, 1]);

export const STRING_CALLBACKS: MacroList<PropertyCallMacro> = {
	size,
	trim: stringMatchCallback("^%s*(.-)%s*$"),
	trimStart: stringMatchCallback("^%s*(.-)$"),
	trimEnd: stringMatchCallback("^(.-)%s*$"),
	split: makeStringCallback(lua.globals.string.split),
	slice: makeStringCallback(lua.globals.string.sub, [1, 0]),
	sub: makeStringCallback(lua.globals.string.sub, [1, 1]),
	byte: makeStringCallback(lua.globals.string.byte, [1, 1]),
	format: makeStringCallback(lua.globals.string.format),
	find: (state, node, expression) =>
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS("string_find_wrap"),
			args: lua.list.make(findMacro(state, node, expression)),
		}),
};
