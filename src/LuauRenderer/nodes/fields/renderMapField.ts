import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { assert } from "Shared/util/assert";

export function renderMapField(state: RenderState, node: luau.MapField) {
	const { index, value } = node;
	const valueStr = render(state, value);
	if (luau.isStringLiteral(index) && luau.isValidIdentifier(index.value)) {
		return `${index.value} = ${valueStr}`;
	} else {
		assert(!luau.isComplexStringLiteral(index), "Complex strings not allowed as table literal keys");
		const indexStr = render(state, index);
		return `[${indexStr}] = ${valueStr}`;
	}
}
