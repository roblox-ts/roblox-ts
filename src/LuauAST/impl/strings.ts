import * as luau from "LuauAST/bundle";

export const strings = {
	// metamethods
	__index: luau.string("__index"),
	__tostring: luau.string("__tostring"),
	__mode: luau.string("__mode"),
	k: luau.string("k"), // used for __mode

	// types
	number: luau.string("number"),
	table: luau.string("table"),

	// opcall
	success: luau.string("success"),
	value: luau.string("value"),
	error: luau.string("error"),

	// other
	", ": luau.string(", "), // used for ReadonlyArray.join()
};
