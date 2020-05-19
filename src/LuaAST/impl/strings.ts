import * as lua from "LuaAST";

export const strings = {
	// metamethods
	__index: lua.string("__index"),
	__tostring: lua.string("__tostring"),
	__mode: lua.string("__mode"),
	k: lua.string("k"), // used for __mode

	// types
	number: lua.string("number"),
	table: lua.string("table"),

	// opcall
	success: lua.string("success"),
	value: lua.string("value"),
	error: lua.string("error"),

	// other
	", ": lua.string(", "), // used for ReadonlyArray.join()
};
