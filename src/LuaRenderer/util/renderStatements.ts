import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

/**
 * Renders the given list of statements.
 */
export function renderStatements(state: RenderState, statements: lua.List<lua.Statement>) {
	let result = "";
	let statement = statements.head;
	while (statement !== undefined) {
		result += render(state, statement);
		statement = statement.next;
	}
	return result;
}
