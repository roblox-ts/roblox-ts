import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { isValidLuauIdentifier } from "LuauRenderer/util/isValidLuauIdentifier";
import { assert } from "Shared/util/assert";

export function renderIdentifier(state: RenderState, node: luau.Identifier) {
	assert(isValidLuauIdentifier(node.name), `Invalid Luau Identifier: "${node.name}"`);
	return node.name;
}
