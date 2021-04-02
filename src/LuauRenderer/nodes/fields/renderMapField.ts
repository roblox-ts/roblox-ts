import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderMapField(state: RenderState, node: luau.MapField) {
	const { index, value } = node;
	const valueStr = render(state, value);
	if (luau.isStringLiteral(index) && luau.isValidIdentifier(index.value)) {
		return `${index.value} = ${valueStr}`;
	} else {
		const indexStr = render(state, index);
		return `[${indexStr}] = ${valueStr}`;
	}
}
