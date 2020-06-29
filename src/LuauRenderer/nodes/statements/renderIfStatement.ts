import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { renderStatements } from "LuauRenderer/util/renderStatements";

function renderShorthandIfStatement(state: RenderState, node: luau.IfStatement) {
	const statementStr = renderStatements(state, node.statements).trim();
	return state.line(`if ${render(state, node.condition)} then ${statementStr} end`);
}

/** must be if X == nil then X = Y end */
function shouldRenderShorthand(node: luau.IfStatement): boolean {
	return (
		luau.isBinaryExpression(node.condition) &&
		luau.isAnyIdentifier(node.condition.left) &&
		node.condition.operator === "==" &&
		luau.isNilLiteral(node.condition.right) &&
		luau.list.isList(node.elseBody) &&
		node.elseBody.head === undefined &&
		node.statements.head !== undefined &&
		node.statements.head === node.statements.tail &&
		luau.isAssignment(node.statements.head.value)
	);
}

export function renderIfStatement(state: RenderState, node: luau.IfStatement) {
	// if no elseBody, and only one statement
	if (shouldRenderShorthand(node)) {
		return renderShorthandIfStatement(state, node);
	}

	let result = "";

	result += state.line(`if ${render(state, node.condition)} then`);
	if (node.statements) {
		result += state.scope(() => renderStatements(state, node.statements));
	}

	let currentElseBody = node.elseBody;
	while (luau.isNode(currentElseBody)) {
		const statements = currentElseBody.statements;
		result += state.line(`elseif ${render(state, currentElseBody.condition)} then`);
		result += state.scope(() => renderStatements(state, statements));
		currentElseBody = currentElseBody.elseBody;
	}

	if (currentElseBody && currentElseBody.head) {
		result += state.line(`else`);
		const statements = currentElseBody;
		result += state.scope(() => renderStatements(state, statements));
	}

	result += state.line(`end`);

	return result;
}
