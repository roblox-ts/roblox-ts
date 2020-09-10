import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";

export function renderComputedIndexExpression(state: RenderState, node: luau.ComputedIndexExpression) {
	const expStr = render(state, node.expression);
	if (luau.isStringLiteral(node.index) && isValidLuauIdentifier(node.index.value)) {
		return `${expStr}.${node.index.value}`;
	} else {
		const indexStr = render(state, node.index);
		return `${expStr}[${indexStr}]`;
	}
}
