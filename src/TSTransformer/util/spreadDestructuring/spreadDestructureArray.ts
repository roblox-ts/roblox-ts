import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";

export function spreadDestructureArray(state: TransformState, parentId: luau.AnyIdentifier, index: number) {
	return luau.call(luau.globals.table.move, [
		parentId,
		luau.number(index + 1),
		luau.unary("#", parentId),
		luau.number(1),
		luau.array(),
	]);
}
