import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

function endsWithIndexableExpressionInner(node: lua.Expression): boolean {
	if (lua.isIndexableExpression(node)) {
		// a or (a) or a.b or a[b] or a()
		return true;
	} else if (lua.isBinaryExpression(node)) {
		// a + b
		return endsWithIndexableExpressionInner(node.right);
	} else if (lua.isUnaryExpression(node)) {
		// -a
		return endsWithIndexableExpressionInner(node.expression);
	}
	return false;
}

function endsWithIndexableExpression(node: lua.Statement) {
	if (lua.isCallStatement(node)) {
		// a()
		return true;
	} else if (lua.isVariableDeclaration(node) || lua.isAssignment(node)) {
		// local a = b or a = b
		return endsWithIndexableExpressionInner(node.right ?? node.left);
	}
	return false;
}

function startsWithParenthesisInner(node: lua.Expression): boolean {
	if (lua.isParenthesizedExpression(node)) {
		// (a)
		return true;
	} else if (
		lua.isCallExpression(node) ||
		lua.isMethodCallExpression(node) ||
		lua.isPropertyAccessExpression(node) ||
		lua.isComputedIndexExpression(node)
	) {
		// (a)() or (a):b() or (a).b or (a)[b]
		return startsWithParenthesisInner(node.expression);
	}
	return false;
}

function startsWithParenthesis(node: lua.Statement) {
	if (lua.isCallStatement(node)) {
		// (a)()
		return startsWithParenthesisInner(node.expression.expression);
	} else if (lua.isAssignment(node)) {
		// (a).b = c
		return startsWithParenthesisInner(node.right);
	}
}

function getNextNonComment(state: RenderState, node: lua.Statement) {
	let listNode = state.peekListNode()?.next;
	while (listNode && lua.isComment(listNode.value)) {
		listNode = listNode.next;
	}
	return listNode?.value;
}

/**
 * Resolves if the given statement needs to end with a `;` or not.
 *
 * Used to avoid "ambiguous syntax" errors in Lua.
 *
 * This is only necessary in statements which can end in an IndexableExpression:
 * - CallStatement
 * - VariableDeclaration
 * - Assignment
 */
export function getEnding(state: RenderState, node: lua.Statement) {
	const nextStatement = getNextNonComment(state, node);
	if (nextStatement !== undefined && endsWithIndexableExpression(node) && startsWithParenthesis(nextStatement)) {
		return ";";
	} else {
		return "";
	}
}
