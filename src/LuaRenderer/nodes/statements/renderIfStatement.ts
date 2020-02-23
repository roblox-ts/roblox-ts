import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";
import { renderStatements } from "LuaRenderer/util/renderStatements";

function renderShorthandIfStatement(state: RenderState, node: lua.IfStatement) {
	const statementStr = renderStatements(state, node.statements).trim();
	return state.indent + `if ${render(state, node.condition)} then ${statementStr} end\n`;
}

function shouldRenderShorthand(node: lua.IfStatement): boolean {
	return (
		lua.isBinaryExpression(node.condition) &&
		lua.isIdentifier(node.condition.left) &&
		node.condition.operator === lua.BinaryOperator.EqualsEquals &&
		lua.isNilLiteral(node.condition.right) &&
		lua.list.isList(node.elseBody) &&
		node.elseBody.head === undefined &&
		node.statements.head !== undefined &&
		node.statements.head === node.statements.tail &&
		lua.isAssignment(node.statements.head.value)
	);
}

export function renderIfStatement(state: RenderState, node: lua.IfStatement) {
	// if no elseBody, and only one statement
	if (shouldRenderShorthand(node)) {
		return renderShorthandIfStatement(state, node);
	}

	let result = "";

	result += state.indent + `if ${render(state, node.condition)} then\n`;
	if (node.statements) {
		result += state.scope(() => renderStatements(state, node.statements));
	}

	let currentElseBody = node.elseBody;
	while (lua.isNode(currentElseBody)) {
		const statements = currentElseBody.statements;
		result += state.indent + `elseif ${render(state, currentElseBody.condition)} then\n`;
		result += state.scope(() => renderStatements(state, statements));
		currentElseBody = currentElseBody.elseBody;
	}

	if (currentElseBody && currentElseBody.head) {
		result += state.indent + `else\n`;
		const statements = currentElseBody;
		result += state.scope(() => renderStatements(state, statements));
	}

	result += state.indent + `end\n`;

	return result;
}
