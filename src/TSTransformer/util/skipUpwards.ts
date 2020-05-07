import ts from "byots";

export function skipUpwards(node: ts.Node) {
	let parent = node.parent;
	while (
		parent &&
		(ts.isNonNullExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent))
	) {
		node = parent;
		parent = node.parent;
	}
	return node;
}
