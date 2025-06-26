import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";

export function spreadDestructureString(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
) {
	const matcher = idStack[0];
	assert(matcher, "No matcher expression in id stack");

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
