import * as lua from "LuaAST";
import { RenderState } from "LuaRenderer";
import { isValidLuaIdentifier } from "LuaRenderer/util/isValidLuaIdentifier";
import { assert } from "Shared/util/assert";

export function renderIdentifier(state: RenderState, node: lua.Identifier) {
	assert(isValidLuaIdentifier(node.name), `Invalid Lua Identifier: "${node.name}"`);
	return node.name;
}
