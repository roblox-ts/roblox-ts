import luau from "@roblox-ts/luau-ast";

/**
 * Returns a LuauAST node equivalent for `game:GetService(serviceName)`
 * @param serviceName The service to get from game.
 */
export function createGetService(serviceName: string) {
	return luau.create(luau.SyntaxKind.MethodCallExpression, {
		expression: luau.globals.game,
		name: "GetService",
		args: luau.list.make(luau.string(serviceName)),
	});
}
