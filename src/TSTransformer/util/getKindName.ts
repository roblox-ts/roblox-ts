import ts from "typescript";

export function getKindName(node: ts.Node) {
	return ts.SyntaxKind[node.kind];
}
