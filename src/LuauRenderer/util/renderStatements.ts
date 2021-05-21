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
	let hasFinalStatement = false;
	while (listNode !== undefined) {
		assert(
			!hasFinalStatement || luau.isComment(listNode.value),
			"Cannot render statement after break, continue, or return!",
		);
		hasFinalStatement ||= luau.isFinalStatement(listNode.value);

		state.pushListNode(listNode);
		result += render(state, listNode.value);
		state.popListNode();

		listNode = listNode.next;
	}
	return result;
}
