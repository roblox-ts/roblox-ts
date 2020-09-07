import * as luau from "LuauAST/bundle";

const COROUTINE_ID = luau.id("coroutine");
const MATH_ID = luau.id("math");
const STRING_ID = luau.id("string");
const TABLE_ID = luau.id("table");
const UTF8_ID = luau.id("utf8");

function property(id: luau.Identifier, name: string) {
	return luau.create(luau.SyntaxKind.PropertyAccessExpression, { expression: id, name: name });
}

export const globals = {
	_G: luau.id("_G"),
	bit32: luau.id("bit32"),
	coroutine: {
		yield: property(COROUTINE_ID, "yield"),
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
		byte: property(STRING_ID, "byte"),
		find: property(STRING_ID, "find"),
		format: property(STRING_ID, "format"),
		gmatch: property(STRING_ID, "gmatch"),
		gsub: property(STRING_ID, "gsub"),
		match: property(STRING_ID, "match"),
		rep: property(STRING_ID, "rep"),
		split: property(STRING_ID, "split"),
		sub: property(STRING_ID, "sub"),
	},
	super: luau.id("super"),
	table: {
		concat: property(TABLE_ID, "concat"),
		create: property(TABLE_ID, "create"),
		remove: property(TABLE_ID, "remove"),
		find: property(TABLE_ID, "find"),
		sort: property(TABLE_ID, "sort"),
		insert: property(TABLE_ID, "insert"),
	},
	utf8: {
		charpattern: property(UTF8_ID, "charpattern"),
		codes: property(UTF8_ID, "codes"),
	},
	math: {
		min: property(MATH_ID, "min"),
	},
	tostring: luau.id("tostring"),
	type: luau.id("type"),
	typeof: luau.id("typeof"),
	unpack: luau.id("unpack"),

	// roblox
	game: luau.id("game"),
};
