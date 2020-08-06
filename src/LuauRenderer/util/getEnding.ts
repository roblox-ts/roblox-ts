import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { assert } from "Shared/util/assert";

function endsWithIndexableExpressionInner(node: luau.Expression): boolean {
	if (luau.isIndexableExpression(node)) {
		// `a` or `(a)` or `a.b` or `a[b]` or `a()`
		return true;
	} else if (luau.isBinaryExpression(node)) {
		// `a + b`
		return endsWithIndexableExpressionInner(node.right);
	} else if (luau.isUnaryExpression(node)) {
		// `-a`
		return endsWithIndexableExpressionInner(node.expression);
	}
	return false;
}

function endsWithIndexableExpression(node: luau.Statement) {
	if (luau.isCallStatement(node)) {
		// `a()`
		return true;
	} else if (luau.isVariableDeclaration(node) || luau.isAssignment(node)) {
		// `local a = b` or `a = b` or `local a` or `local a, b`
		let furthestRight: luau.Expression;
		if (node.right) {
			furthestRight = node.right;
		} else if (luau.list.isList(node.left)) {
			assert(node.left.tail);
			furthestRight = node.left.tail.value;
		} else {
			furthestRight = node.left;
		}
		return endsWithIndexableExpressionInner(furthestRight);
	}
	return false;
}

function startsWithParenthesisInner(node: luau.Expression): boolean {
	if (luau.isParenthesizedExpression(node)) {
		// `(a)`
		return true;
	} else if (luau.isCall(node) || luau.isPropertyAccessExpression(node) || luau.isComputedIndexExpression(node)) {
		// `(a)()` or `(a):b()` or `(a).b` or `(a)[b]`
		return startsWithParenthesisInner(node.expression);
	}
	return false;
}

function startsWithParenthesis(node: luau.Statement) {
	if (luau.isCallStatement(node)) {
		// `(a)()`
		return startsWithParenthesisInner(node.expression.expression);
	} else if (luau.isAssignment(node)) {
		if (luau.list.isList(node.left)) {
			// `(a).b, c = d`
			assert(node.left.head);
			return startsWithParenthesisInner(node.left.head.value);
		} else {
			// `(a).b = c`
			return startsWithParenthesisInner(node.left);
		}
	}
	return false;
}

function getNextNonComment(state: RenderState, node: luau.Statement) {
	let listNode = state.peekListNode()?.next;
	while (listNode && luau.isComment(listNode.value)) {
		listNode = listNode.next;
	}
	return listNode?.value;
}

/**
 * Resolves if the given statement needs to end with a `;` or not.
 *
 * Used to avoid "ambiguous syntax" errors in Luau.
 *
 * This is only necessary in statements which can end in an IndexableExpression:
 * - CallStatement
 * - VariableDeclaration
 * - Assignment
 */
export function getEnding(state: RenderState, node: luau.Statement) {
	const nextStatement = getNextNonComment(state, node);
	if (nextStatement !== undefined && endsWithIndexableExpression(node) && startsWithParenthesis(nextStatement)) {
		return ";";
	} else {
		return "";
	}
}
