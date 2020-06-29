import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { assert } from "Shared/util/assert";

/**
 * Renders the given list of statements.
 *
 * Pushes each listNode onto the state.listNodesStack as it gets
 * rendered to give context to other statements as they render.
 * Useful for getting the next or previous sibling statement.
 */
export function renderStatements(state: RenderState, statements: luau.List<luau.Statement>) {
	let result = "";
	let listNode = statements.head;
	let hasFinalStatent = false;
	while (listNode !== undefined) {
		assert(!hasFinalStatent || luau.isComment(listNode.value), "Cannot render statement after break or return!!");
		hasFinalStatent = hasFinalStatent || luau.isFinalStatement(listNode.value);

		state.pushListNode(listNode);
		result += render(state, listNode.value);
		state.popListNode();

		listNode = listNode.next;
	}
	return result;
}
