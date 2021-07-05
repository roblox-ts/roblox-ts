import luau from "LuauAST";

export function getKindName(kind: luau.SyntaxKind) {
	// avoid FirstExpression, LastExpression, etc.
	if (kind === luau.SyntaxKind.Identifier) return "Identifier";
	else if (kind === luau.SyntaxKind.ParenthesizedExpression) return "ParenthesizedExpression";
	else if (kind === luau.SyntaxKind.Set) return "Set";
	else if (kind === luau.SyntaxKind.Assignment) return "Assignment";
	else if (kind === luau.SyntaxKind.Comment) return "Comment";
	else if (kind === luau.SyntaxKind.MapField) return "MapField";
	return luau.SyntaxKind[kind];
}
