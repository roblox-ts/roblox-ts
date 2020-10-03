import luau from "LuauAST";

export function createTypeCheck(expression: luau.Expression, typeName: luau.StringLiteral) {
	return luau.create(luau.SyntaxKind.BinaryExpression, {
		left: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.type,
			args: luau.list.make(expression),
		}),
		operator: "==",
		right: typeName,
	});
}
