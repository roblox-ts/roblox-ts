import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";

export function spreadDestructArray(state: TransformState, parentId: luau.AnyIdentifier, index: number) {
	const restId = state.pushToVar(luau.array(), "rest");
	state.prereq(
		luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.call(luau.globals.table.move, [
				parentId,
				luau.number(index + 1),
				luau.unary("#", parentId),
				luau.number(1),
				restId,
			]),
		}),
	);

	return restId;
}
