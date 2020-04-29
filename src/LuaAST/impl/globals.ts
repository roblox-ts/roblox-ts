import * as lua from "LuaAST";

const TABLE_ID = lua.id("table");
const STRING_ID = lua.id("string");

function property(id: lua.Identifier, name: string) {
	return lua.create(lua.SyntaxKind.PropertyAccessExpression, { expression: id, name: name });
}

export const globals = {
	bit32: lua.id("bit32"),
	error: lua.id("error"),
	ipairs: lua.id("ipairs"),
	setmetatable: lua.id("setmetatable"),
	tostring: lua.id("tostring"),
	typeof: lua.id("typeof"),
	string: {
		gmatch: property(STRING_ID, "gmatch"),
	},
	table: {
		create: property(TABLE_ID, "create"),
		concat: property(TABLE_ID, "concat"),
	},
};
