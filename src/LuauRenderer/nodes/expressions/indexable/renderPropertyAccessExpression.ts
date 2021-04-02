import luau from "LuauAST";
import { render, RenderState } from "LuauRenderer";

export function renderPropertyAccessExpression(state: RenderState, node: luau.PropertyAccessExpression) {
	const expStr = render(state, node.expression);
	const nameStr = node.name;
	if (luau.isValidIdentifier(nameStr)) {
		return `${expStr}.${nameStr}`;
	} else {
		return `${expStr}["${nameStr}"]`;
	}
}
