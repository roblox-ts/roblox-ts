import * as lua from "LuaAST";

/**
 * Returns a LuaAST node equivalent for `game:GetService(serviceName)`
 * @param serviceName The service to get from game.
 */
export function createGetService(serviceName: string) {
	return lua.create(lua.SyntaxKind.MethodCallExpression, {
		expression: lua.globals.game,
		name: "GetService",
		args: lua.list.make(lua.string(serviceName)),
	});
}
