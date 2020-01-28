import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";
import { isValidLuaIdentifier } from "LuaRenderer/util/isValidLuaIdentifier";

export function renderMapField(state: RenderState, node: lua.MapField) {
	const valueStr = render(state, node.value);
	if (lua.isStringLiteral(node) && isValidLuaIdentifier(node.value)) {
		return `${node.name} = ${valueStr}`;
	} else {
		return `[${node.name}] = ${valueStr}`;
	}
}
