import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";

export function renderPropertyAccessExpression(state: RenderState, node: luau.PropertyAccessExpression) {
	const expStr = render(state, node.expression);
	const nameStr = node.name;
	if (isValidLuauIdentifier(nameStr)) {
		return `${expStr}.${nameStr}`;
	} else {
		return `${expStr}["${nameStr}"]`;
	}
}
