import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { assert } from "Shared/util/assert";

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
	let canAddNewStatement = true;
	while (listNode !== undefined) {
		assert(canAddNewStatement, "Cannot render statement after break or return!");
		state.pushListNode(listNode);
		const statement = listNode.value;
		result += render(state, statement);
		canAddNewStatement = !lua.isReturnStatement(statement) && !lua.isBreakStatement(statement);
		listNode = listNode.next;
		state.popListNode();
	}
	return result;
}
