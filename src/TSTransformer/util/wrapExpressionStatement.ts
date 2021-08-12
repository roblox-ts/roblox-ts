import luau from "LuauAST";

export function wrapExpressionStatement(node: luau.Expression): luau.List<luau.Statement> {
	if (luau.isEmptyIdentifier(node) || luau.isTemporaryIdentifier(node) || luau.isNilLiteral(node)) {
		return luau.list.make();
	} else if (luau.isCall(node)) {
		return luau.list.make(luau.create(luau.SyntaxKind.CallStatement, { expression: node }));
	} else {
		return luau.list.make(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.emptyId(),
				right: node,
			}),
		);
	}
}
