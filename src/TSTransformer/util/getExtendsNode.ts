import ts from "byots";

export function getExtendsNode(node: ts.ClassLikeDeclaration) {
	for (const clause of node.heritageClauses ?? []) {
		if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
			return clause.types[0];
		}
	}
}
