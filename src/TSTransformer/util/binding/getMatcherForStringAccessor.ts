import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";

export function getMatcherForStringAccessor(
	prereqs: Prereqs,
	parentId: luau.AnyIdentifier,
	idStack: Array<luau.AnyIdentifier>,
) {
	if (idStack.length === 0) {
		return prereqs.pushToVar(
			luau.call(luau.globals.string.gmatch, [parentId, luau.globals.utf8.charpattern]),
			"matcher",
		);
	}

	return idStack[0];
}
