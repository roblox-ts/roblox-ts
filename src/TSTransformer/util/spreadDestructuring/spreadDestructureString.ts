import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { getMatcherForStringAccessor } from "TSTransformer/util/binding/getMatcherForStringAccessor";

export function spreadDestructureString(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
) {
	const matcher = getMatcherForStringAccessor(state, parentId, idStack);
	const rest = state.pushToVar(luau.array(), "rest");
	const charId = luau.tempId("char");

	state.prereq(
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(charId),
			expression: matcher,
			statements: luau.list.make(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.table.insert, [rest, charId]),
				}),
			),
		}),
	);

	return rest;
}
