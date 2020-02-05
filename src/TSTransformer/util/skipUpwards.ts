import ts from "typescript";

export function skipUpwards(node: ts.Node) {
	let parent = node.parent;
	do {
		parent = node.parent;
	} while (ts.isParenthesizedExpression(parent));
	return parent;
}
