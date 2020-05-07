import ts from "byots";

export function skipDownwards(node: ts.Expression): ts.Expression;
export function skipDownwards(node: ts.Node): ts.Node {
	while (ts.isParenthesizedExpression(node)) {
		node = node.expression;
	}
	return node;
}
