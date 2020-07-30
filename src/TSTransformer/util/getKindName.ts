import ts from "byots";

export function getKindName(result: ts.SyntaxKind) {
	if (result === ts.SyntaxKind.FirstAssignment) return "EqualsToken";
	if (result === ts.SyntaxKind.FirstCompoundAssignment) return "PlusEqualsToken";
	if (result === ts.SyntaxKind.LastReservedWord) return "WithKeyword";
	if (result === ts.SyntaxKind.FirstKeyword) return "BreakKeyword";
	if (result === ts.SyntaxKind.FirstFutureReservedWord) return "ImplementsKeyword";
	if (result === ts.SyntaxKind.LastFutureReservedWord) return "YieldKeyword";
	if (result === ts.SyntaxKind.FirstTypeNode) return "TypePredicate";
	if (result === ts.SyntaxKind.LastTypeNode) return "ImportType";
	if (result === ts.SyntaxKind.FirstPunctuation) return "OpenBraceToken";
	if (result === ts.SyntaxKind.FirstToken) return "Unknown";
	if (result === ts.SyntaxKind.FirstTriviaToken) return "SingleLineCommentTrivia";
	if (result === ts.SyntaxKind.LastTriviaToken) return "ConflictMarkerTrivia";
	if (result === ts.SyntaxKind.FirstLiteralToken) return "NumericLiteral";
	if (result === ts.SyntaxKind.FirstTemplateToken) return "NoSubstitutionTemplateLiteral";
	if (result === ts.SyntaxKind.LastTemplateToken) return "TemplateTail";
	if (result === ts.SyntaxKind.FirstBinaryOperator) return "LessThanToken";
	if (result === ts.SyntaxKind.LastBinaryOperator) return "CaretEqualsToken";
	if (result === ts.SyntaxKind.FirstStatement) return "VariableStatement";
	if (result === ts.SyntaxKind.LastStatement) return "DebuggerStatement";
	if (result === ts.SyntaxKind.FirstNode) return "QualifiedName";
	if (result === ts.SyntaxKind.FirstJSDocNode) return "JSDocTypeExpression";
	if (result === ts.SyntaxKind.FirstJSDocTagNode) return "JSDocTag";
	if (result === ts.SyntaxKind.LastJSDocTagNode) return "JSDocPropertyTag";
	if (result === ts.SyntaxKind.FirstContextualKeyword) return "AbstractKeyword";
	if (result === ts.SyntaxKind.LastContextualKeyword) return "OfKeyword";
	return ts.SyntaxKind[result];
}
