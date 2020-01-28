import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";
import { isValidLuaIdentifier } from "LuaRenderer/util/isValidLuaIdentifier";

export function renderIdentifier(state: RenderState, node: lua.Identifier) {
	if (!isValidLuaIdentifier(node.name)) {
		throw `Invalid Lua Identifier: "${node.name}"`;
	}
	return node.name;
}
