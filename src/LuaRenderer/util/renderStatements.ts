import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

/**
 * Renders the given list of statements.
 *
 * Pushes each statement onto the state.statementStack as it gets
 * rendered to give context to other statements as they render.
 * Useful for getting the next or previous sibling statement.
 */
export function renderStatements(state: RenderState, statements: lua.List<lua.Statement>) {
	let result = "";
	let statement = statements.head;
	while (statement !== undefined) {
		state.pushStatementStack(statement);
		result += render(state, statement);
		statement = statement.next;
		state.popStatementStack();
	}
	return result;
}
