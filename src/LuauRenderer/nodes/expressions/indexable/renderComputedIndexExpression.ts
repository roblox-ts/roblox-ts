import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { assert } from "Shared/util/assert";

export function renderComputedIndexExpression(state: RenderState, node: luau.ComputedIndexExpression) {
	const expStr = render(state, node.expression);
	if (luau.isStringLiteral(node.index) && luau.isValidIdentifier(node.index.value)) {
		return `${expStr}.${node.index.value}`;
	} else {
		assert(!luau.isComplexStringLiteral(node.index), "Complex string not allowed as index");
		const indexStr = render(state, node.index);
		return `${expStr}[${indexStr}]`;
	}
}
