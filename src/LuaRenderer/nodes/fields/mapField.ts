import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";
import { isValidLuaIdentifier } from "LuaRenderer/util/isValidLuaIdentifier";

export function renderMapField(state: RenderState, node: lua.MapField) {
	const { index, value } = node;
	const valueStr = render(state, value);
	if (lua.isStringLiteral(index) && isValidLuaIdentifier(index.value)) {
		return `${index.value} = ${valueStr}`;
	} else {
		const indexStr = render(state, index);
		return `[${indexStr}] = ${valueStr}`;
	}
}
