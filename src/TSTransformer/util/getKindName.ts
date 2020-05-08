import ts from "byots";

export function getKindName(node: ts.Node) {
	const result = ts.SyntaxKind[node.kind];
	if (result === "FirstAssignment") return "EqualsToken";
	if (result === "FirstCompoundAssignment") return "PlusEqualsToken";
	if (result === "LastReservedWord") return "WithKeyword";
	if (result === "FirstKeyword") return "BreakKeyword";
	if (result === "FirstFutureReservedWord") return "ImplementsKeyword";
	if (result === "LastFutureReservedWord") return "YieldKeyword";
	if (result === "FirstTypeNode") return "TypePredicate";
	if (result === "LastTypeNode") return "ImportType";
	if (result === "FirstPunctuation") return "OpenBraceToken";
	if (result === "FirstToken") return "Unknown";
	if (result === "FirstTriviaToken") return "SingleLineCommentTrivia";
	if (result === "LastTriviaToken") return "ConflictMarkerTrivia";
	if (result === "FirstLiteralToken") return "NumericLiteral";
	if (result === "FirstTemplateToken") return "NoSubstitutionTemplateLiteral";
	if (result === "LastTemplateToken") return "TemplateTail";
	if (result === "FirstBinaryOperator") return "LessThanToken";
	if (result === "LastBinaryOperator") return "CaretEqualsToken";
	if (result === "FirstStatement") return "VariableStatement";
	if (result === "LastStatement") return "DebuggerStatement";
	if (result === "FirstNode") return "QualifiedName";
	if (result === "FirstJSDocNode") return "JSDocTypeExpression";
	if (result === "FirstJSDocTagNode") return "JSDocTag";
	if (result === "LastJSDocTagNode") return "JSDocPropertyTag";
	if (result === "FirstContextualKeyword") return "AbstractKeyword";
	if (result === "LastContextualKeyword") return "OfKeyword";
	return result;
}
