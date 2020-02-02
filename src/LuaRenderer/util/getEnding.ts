import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";

function endsWithIndexableExpression(node: lua.Statement) {
	if (lua.isCallStatement(node)) {
		// a()
		return true;
	} else if (lua.isVariableDeclaration(node) && lua.isIndexableExpression(node.right)) {
		// local a = b
		return true;
	} else if (lua.isAssignment(node) && lua.isIndexableExpression(node.right)) {
		// a = b
		return true;
	}
	return false;
}

function startsWithParenthesisInner(node: lua.Expression): boolean {
	if (lua.isParenthesizedExpression(node)) {
		// (a)
		return true;
	} else if (lua.isPropertyAccessExpression(node) || lua.isComputedIndexExpression(node)) {
		// (a).b or (a)[b]
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

function getNextNonComment(state: RenderState) {
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
	const nextStatement = getNextNonComment(state);
	if (nextStatement !== undefined && endsWithIndexableExpression(node) && startsWithParenthesis(nextStatement)) {
		return ";";
	} else {
		return "";
	}
}
