import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer/RenderState";

/**
 * returns true if the next sibling node is a CallStatement, skipping over any Comment nodes
 */
function needsSemicolon(state: RenderState): boolean {
	let listNode = state.peekListNode()?.next;
	while (listNode) {
		if (lua.isCallStatement(listNode.value)) {
			return true;
		}
		if (lua.isComment(listNode.value)) {
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
