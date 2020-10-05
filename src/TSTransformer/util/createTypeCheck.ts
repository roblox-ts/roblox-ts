import luau from "LuauAST";

export function createTypeCheck(expression: luau.Expression, typeName: luau.StringLiteral) {
	return luau.binary(luau.call(luau.globals.type, [expression]), "==", typeName);
}
