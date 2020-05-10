import * as lua from "LuaAST";

const TABLE_ID = lua.id("table");
const STRING_ID = lua.id("string");
const UTF8_ID = lua.id("utf8");

function property(id: lua.Identifier, name: string) {
	return lua.create(lua.SyntaxKind.PropertyAccessExpression, { expression: id, name: name });
}

export const globals = {
	bit32: lua.id("bit32"),
	error: lua.id("error"),
	ipairs: lua.id("ipairs"),
	pairs: lua.id("pairs"),
	next: lua.id("next"),
	select: lua.id("select"),
	setmetatable: lua.id("setmetatable"),
	string: {
		byte: property(STRING_ID, "byte"),
		find: property(STRING_ID, "find"),
		format: property(STRING_ID, "format"),
		gmatch: property(STRING_ID, "gmatch"),
		match: property(STRING_ID, "match"),
		rep: property(STRING_ID, "rep"),
		split: property(STRING_ID, "split"),
		sub: property(STRING_ID, "sub"),
	},
	table: {
		concat: property(TABLE_ID, "concat"),
		create: property(TABLE_ID, "create"),
		remove: property(TABLE_ID, "remove"),
	},
	utf8: {
		charpattern: property(UTF8_ID, "charpattern"),
		codes: property(UTF8_ID, "codes"),
	},
	tostring: lua.id("tostring"),
	typeof: lua.id("typeof"),
	unpack: lua.id("unpack"),
};
