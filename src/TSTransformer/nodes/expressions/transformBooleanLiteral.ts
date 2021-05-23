import luau from "LuauAST";

export function transformTrueKeyword() {
	return luau.create(luau.SyntaxKind.TrueLiteral, {});
}

export function transformFalseKeyword() {
	return luau.create(luau.SyntaxKind.FalseLiteral, {});
}
