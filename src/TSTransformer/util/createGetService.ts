import * as lua from "LuaAST";

export function createGetService(serviceName: string) {
	return lua.create(lua.SyntaxKind.MethodCallExpression, {
		expression: lua.globals.game,
		name: "GetService",
		args: lua.list.make(lua.string(serviceName)),
	});
}
