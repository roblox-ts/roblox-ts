import luau from "LuauAST";

export function transformSuperKeyword() {
	return luau.globals.super;
}
