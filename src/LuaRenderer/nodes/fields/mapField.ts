import { render } from "../..";
import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";
import { isValidLuaIdentifier } from "../../util/isValidLuaIdentifier";

export function renderMapField(state: RenderState, node: lua.MapField) {
	const valueStr = render(state, node.value);
	if (lua.isStringLiteral(node) && isValidLuaIdentifier(node.value)) {
		return `${node.name} = ${valueStr}`;
	} else {
		return `[${node.name}] = ${valueStr}`;
	}
}
