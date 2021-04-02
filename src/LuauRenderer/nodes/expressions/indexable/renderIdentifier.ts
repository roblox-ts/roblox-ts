import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { assert } from "Shared/util/assert";

export function renderIdentifier(state: RenderState, node: luau.Identifier) {
	assert(luau.isValidIdentifier(node.name), `Invalid Luau Identifier: "${node.name}"`);
	return node.name;
}
