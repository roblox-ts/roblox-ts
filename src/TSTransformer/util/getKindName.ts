import ts from "byots";

export function getKindName(node: ts.Node) {
	return ts.SyntaxKind[node.kind];
}
