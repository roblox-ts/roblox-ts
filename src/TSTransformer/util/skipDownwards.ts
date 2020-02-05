import ts from "typescript";

export function skipDownwards(node: ts.Expression): ts.Expression;
export function skipDownwards(node: ts.Node): ts.Node {
	while (ts.isParenthesizedExpression(node)) {
		node = node.expression;
	}
	return node;
}
