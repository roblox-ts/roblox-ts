import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { assert } from "Shared/util/assert";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";

export function renderIdentifier(state: RenderState, node: luau.Identifier) {
	assert(isValidLuauIdentifier(node.name), `Invalid Luau Identifier: "${node.name}"`);
	return node.name;
}
