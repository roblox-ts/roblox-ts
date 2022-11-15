import ts from "typescript";

export function getKindName(kind: ts.SyntaxKind) {
	// Lines commented out are where SyntaxKinds are part of multiple markers
	// Only the last one is checked to avoid "unrelated compare" type errors in this file

	if (kind === ts.SyntaxKind.FirstAssignment) return "EqualsToken";
	// if (kind === ts.SyntaxKind.LastAssignment) return "CaretEqualsToken";
	if (kind === ts.SyntaxKind.FirstCompoundAssignment) return "PlusEqualsToken";
	// if (kind === ts.SyntaxKind.LastCompoundAssignment) return "CaretEqualsToken";
	// if (kind === ts.SyntaxKind.FirstReservedWord) return "BreakKeyword";
	if (kind === ts.SyntaxKind.LastReservedWord) return "WithKeyword";
	if (kind === ts.SyntaxKind.FirstKeyword) return "BreakKeyword";
	// if (kind === ts.SyntaxKind.LastKeyword) return "OfKeyword";
	if (kind === ts.SyntaxKind.FirstFutureReservedWord) return "ImplementsKeyword";
	if (kind === ts.SyntaxKind.LastFutureReservedWord) return "YieldKeyword";
	if (kind === ts.SyntaxKind.FirstTypeNode) return "TypePredicate";
	if (kind === ts.SyntaxKind.LastTypeNode) return "ImportType";
	if (kind === ts.SyntaxKind.FirstPunctuation) return "OpenBraceToken";
	// if (kind === ts.SyntaxKind.LastPunctuation) return "CaretEqualsToken";
	if (kind === ts.SyntaxKind.FirstToken) return "Unknown";
	if (kind === ts.SyntaxKind.LastToken) return "LastKeyword";
	if (kind === ts.SyntaxKind.FirstTriviaToken) return "SingleLineCommentTrivia";
	if (kind === ts.SyntaxKind.LastTriviaToken) return "ConflictMarkerTrivia";
	if (kind === ts.SyntaxKind.FirstLiteralToken) return "NumericLiteral";
	// if (kind === ts.SyntaxKind.LastLiteralToken) return "NoSubstitutionTemplateLiteral";
	if (kind === ts.SyntaxKind.FirstTemplateToken) return "NoSubstitutionTemplateLiteral";
	if (kind === ts.SyntaxKind.LastTemplateToken) return "TemplateTail";
	if (kind === ts.SyntaxKind.FirstBinaryOperator) return "LessThanToken";
	if (kind === ts.SyntaxKind.LastBinaryOperator) return "CaretEqualsToken";
	if (kind === ts.SyntaxKind.FirstStatement) return "VariableStatement";
	if (kind === ts.SyntaxKind.LastStatement) return "DebuggerStatement";
	if (kind === ts.SyntaxKind.FirstNode) return "QualifiedName";
	if (kind === ts.SyntaxKind.FirstJSDocNode) return "JSDocTypeExpression";
	// if (kind === ts.SyntaxKind.LastJSDocNode) return "JSDocPropertyTag";
	if (kind === ts.SyntaxKind.FirstJSDocTagNode) return "JSDocTag";
	if (kind === ts.SyntaxKind.LastJSDocTagNode) return "JSDocPropertyTag";
	if (kind === ts.SyntaxKind.FirstContextualKeyword) return "AbstractKeyword";
	if (kind === ts.SyntaxKind.LastContextualKeyword) return "OfKeyword";
	return ts.SyntaxKind[kind];
}
