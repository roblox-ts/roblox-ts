import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";

export function renderMapField(state: RenderState, node: luau.MapField) {
	const { index, value } = node;
	const valueStr = render(state, value);
	if (luau.isStringLiteral(index) && isValidLuauIdentifier(index.value)) {
		return `${index.value} = ${valueStr}`;
	} else {
		const indexStr = render(state, index);
		return `[${indexStr}] = ${valueStr}`;
	}
}
