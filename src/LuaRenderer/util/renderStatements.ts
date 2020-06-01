import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { assert } from "Shared/util/assert";

const MAX_LOCALS = 200;

function countLocals(statement: lua.Statement) {
	if (lua.isVariableDeclaration(statement)) {
		return lua.list.isList(statement.left) ? lua.list.size(statement.left) : 1;
	} else if (lua.isFunctionDeclaration(statement)) {
		return statement.localize ? 1 : 0;
	}
	return 0;
}

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

		let amtLocals = countLocals(listNode.value);
		if (state.getLocals() + amtLocals > MAX_LOCALS) {
			// reset amtLocals, because this is now a doStatement
			amtLocals = 0;
			statements.tail = listNode.prev;

			const innerStatements = lua.list.make<lua.Statement>();
			innerStatements.head = listNode;
			innerStatements.tail = lua.list.findTail(listNode);

			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.CallStatement, {
					expression: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.create(lua.SyntaxKind.ParenthesizedExpression, {
							expression: lua.create(lua.SyntaxKind.FunctionExpression, {
								hasDotDotDot: false,
								parameters: lua.list.make(),
								statements: innerStatements,
							}),
						}),
						args: lua.list.make(),
					}),
				}),
			);

			listNode = statements.tail!;
		}

		state.addLocals(amtLocals);

		state.pushListNode(listNode);
		const statement = listNode.value;
		result += render(state, statement);
		state.popListNode();

		canAddNewStatement = !lua.isFinalStatement(statement);
		listNode = listNode.next;
	}
	return result;
}
