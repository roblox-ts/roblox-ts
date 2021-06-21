import luau from "LuauAST";
import { RenderState } from "LuauRenderer";
import { assert } from "Shared/util/assert";

export function renderTemporaryIdentifier(state: RenderState, node: luau.TemporaryIdentifier) {
	const name = state.getTempName(node);
	assert(luau.isValidIdentifier(name), `Invalid Temporary Identifier: "${name}"`);
	return name;
}
