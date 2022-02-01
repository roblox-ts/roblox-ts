import luau from "@roblox-ts/luau-ast";

export function wrapExpressionStatement(node: luau.Expression, result: luau.List<luau.Statement>) {
	if (luau.isCall(node)) {
		luau.list.push(result, luau.create(luau.SyntaxKind.CallStatement, { expression: node }));
	} else if (luau.isTemporaryIdentifier(node) || luau.isNilLiteral(node)) {
		// Assume compiler-generated remnant, can safely ignore
	} else if (luau.isSimple(node) && luau.list.isNonEmpty(result)) {
		// Not compiler-generated expression, but simple, so no side effects
		// Assure that there are prereqs to avoid "vanishing" statements
	} else {
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.tempId(),
				right: node,
			}),
		);
	}
	return result;
}
