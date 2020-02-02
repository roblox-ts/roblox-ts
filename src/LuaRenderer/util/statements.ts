import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

/**
 * Renders the given list of statements.
 *
 * Pushes each listNode onto the state.listNodesStack as it gets
 * rendered to give context to other statements as they render.
 * Useful for getting the next or previous sibling statement.
 */
export function renderStatements(state: RenderState, statements: lua.List<lua.Statement>) {
	let result = "";
	let listNode = statements.head;
	while (listNode !== undefined) {
		state.pushListNode(listNode);
		result += render(state, listNode.value);
		listNode = listNode.next;
		state.popListNode();
	}
	return result;
}
