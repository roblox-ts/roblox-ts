import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";

export function getMatcherForStringAccessor(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	idStack: Array<luau.AnyIdentifier>,
) {
	if (idStack.length === 0) {
		return state.pushToVar(
			luau.call(luau.globals.string.gmatch, [parentId, luau.globals.utf8.charpattern]),
			"matcher",
		);
	}

	return idStack[0];
}
