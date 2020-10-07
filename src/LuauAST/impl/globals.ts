import * as luau from "LuauAST/bundle";

const COROUTINE_ID = luau.id("coroutine");
const MATH_ID = luau.id("math");
const STRING_ID = luau.id("string");
const TABLE_ID = luau.id("table");
const UTF8_ID = luau.id("utf8");

export const globals = {
	_G: luau.id("_G"),
	bit32: luau.id("bit32"),
	coroutine: {
		yield: luau.property(COROUTINE_ID, "yield"),
	},
	error: luau.id("error"),
	exports: luau.id("exports"),
	getmetatable: luau.id("getmetatable"),
	ipairs: luau.id("ipairs"),
	next: luau.id("next"),
	pairs: luau.id("pairs"),
	pcall: luau.id("pcall"),
	require: luau.id("require"),
	script: luau.id("script"),
	select: luau.id("select"),
	self: luau.id("self"),
	setmetatable: luau.id("setmetatable"),
	string: {
		byte: luau.property(STRING_ID, "byte"),
		find: luau.property(STRING_ID, "find"),
		format: luau.property(STRING_ID, "format"),
		gmatch: luau.property(STRING_ID, "gmatch"),
		gsub: luau.property(STRING_ID, "gsub"),
		lower: luau.property(STRING_ID, "lower"),
		match: luau.property(STRING_ID, "match"),
		rep: luau.property(STRING_ID, "rep"),
		reverse: luau.property(STRING_ID, "reverse"),
		split: luau.property(STRING_ID, "split"),
		sub: luau.property(STRING_ID, "sub"),
		upper: luau.property(STRING_ID, "upper"),
	},
	super: luau.id("super"),
	table: {
		concat: luau.property(TABLE_ID, "concat"),
		create: luau.property(TABLE_ID, "create"),
		remove: luau.property(TABLE_ID, "remove"),
		find: luau.property(TABLE_ID, "find"),
		sort: luau.property(TABLE_ID, "sort"),
		insert: luau.property(TABLE_ID, "insert"),
	},
	utf8: {
		charpattern: luau.property(UTF8_ID, "charpattern"),
		codes: luau.property(UTF8_ID, "codes"),
	},
	math: {
		min: luau.property(MATH_ID, "min"),
	},
	tostring: luau.id("tostring"),
	type: luau.id("type"),
	typeof: luau.id("typeof"),
	unpack: luau.id("unpack"),

	// roblox
	game: luau.id("game"),
};
