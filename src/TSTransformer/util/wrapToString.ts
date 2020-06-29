import luau from "LuauAST";

export function wrapToString(expression: luau.Expression) {
	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.tostring,
		args: luau.list.make(expression),
	});
}
