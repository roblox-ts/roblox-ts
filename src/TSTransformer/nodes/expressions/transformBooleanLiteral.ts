import luau from "@roblox-ts/luau-ast";

export function transformTrueKeyword() {
	return luau.create(luau.SyntaxKind.TrueLiteral, {});
}

export function transformFalseKeyword() {
	return luau.create(luau.SyntaxKind.FalseLiteral, {});
}
