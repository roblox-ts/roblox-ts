import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

/**
 * returns true if the next sibling node is a:
 *
 * 	CallStatement
 * 		CallExpression | MethodCallExpression
 * 			ParenthesizedExpression
 *
 * skipping over any Comment nodes
 */
function needsSemicolon(state: RenderState): boolean {
	let listNode = state.peekListNode()?.next;
	while (listNode) {
		const node = listNode.value;
		if (lua.isCallStatement(node)) {
			return lua.isParenthesizedExpression(node.expression.expression);
		} else if (lua.isComment(node)) {
			listNode = listNode.next;
		} else {
			break;
		}
	}
	return false;
}

export function renderCallStatement(state: RenderState, node: lua.CallStatement) {
	const expStr = render(state, node.expression);
	if (needsSemicolon(state)) {
		return state.indent + `${expStr};\n`;
	} else {
		return state.indent + `${expStr}\n`;
	}
}
