import luau from "@roblox-ts/luau-ast";

export function wrapExpressionStatement(node: luau.Expression): luau.List<luau.Statement> {
	if (luau.isTemporaryIdentifier(node) || luau.isNone(node)) {
		return luau.list.make();
	} else if (luau.isCall(node)) {
		return luau.list.make(luau.create(luau.SyntaxKind.CallStatement, { expression: node }));
	} else {
		return luau.list.make(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.tempId(),
				right: node,
			}),
		);
	}
}
