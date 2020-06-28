import * as lua from "LuaAST";

export function wrapToString(expression: lua.Expression) {
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.tostring,
		args: lua.list.make(expression),
	});
}
