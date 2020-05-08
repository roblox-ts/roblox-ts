import ts from "byots";

export function isAncestorOf(ancestor: ts.Node, node: ts.Node) {
	do {
		if (ancestor === node) {
			return true;
		}
		node = node.parent;
	} while (node);
	return false;
}

export function skipDownwards(node: ts.Expression): ts.Expression;
export function skipDownwards(node: ts.Node): ts.Node {
	while (ts.isNonNullExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
		node = node.expression;
	}
	return node;
}

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

export function getAncestorStatement(node: ts.Node): ts.Statement | undefined {
	while (node && !ts.isStatement(node)) {
		node = node.parent;
	}
	return node;
}
