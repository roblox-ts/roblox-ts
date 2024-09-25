import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";

export function spreadDestructGenerator(state: TransformState, parentId: luau.AnyIdentifier) {
	const keyId = luau.tempId("i");
	const valueId = luau.tempId("v");

	const restId = state.pushToVar(luau.array(), "rest");
	state.prereq(
		luau.create(luau.SyntaxKind.ForStatement, {
			expression: luau.property(parentId, "next"),
			ids: luau.list.make(keyId, valueId),
			statements: luau.list.make(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(luau.globals.table.insert, [restId, valueId]),
				}),
			),
		}),
	);

	return restId;
}
