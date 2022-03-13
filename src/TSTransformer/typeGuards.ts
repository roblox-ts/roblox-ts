import ts from "typescript";

export function isBlockLike(node: ts.Node): node is ts.BlockLike {
	return (
		node.kind === ts.SyntaxKind.SourceFile ||
		node.kind === ts.SyntaxKind.Block ||
		node.kind === ts.SyntaxKind.ModuleBlock ||
		node.kind === ts.SyntaxKind.CaseClause ||
		node.kind === ts.SyntaxKind.DefaultClause
	);
}

export function isUnaryAssignmentOperator(
	operator: ts.SyntaxKind,
): operator is ts.SyntaxKind.PlusPlusToken | ts.SyntaxKind.MinusMinusToken {
	return operator === ts.SyntaxKind.PlusPlusToken || operator === ts.SyntaxKind.MinusMinusToken;
}

export function isTemplateLiteralType(type: ts.Type): type is ts.TemplateLiteralType {
	return "texts" in type && "types" in type && !!(type.flags & ts.TypeFlags.TemplateLiteral);
}

export function isNamespace(node: ts.Node): node is ts.ModuleDeclaration {
	return ts.isModuleDeclaration(node) && !!(node.flags & ts.NodeFlags.Namespace);
}
