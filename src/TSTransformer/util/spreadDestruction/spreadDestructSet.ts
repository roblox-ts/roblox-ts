import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";

export function spreadDestructSet(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	idStack: Array<luau.AnyIdentifier>,
) {
	const extracted = state.pushToVar(luau.set(idStack), "extracted");
	const rest = state.pushToVar(luau.array(), "rest");
	const keyId = luau.tempId("k");

	state.prereq(
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(keyId, luau.tempId("v")),
			expression: parentId,
			statements: luau.list.make(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.unary(
						"not",
						luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: extracted,
							index: keyId,
						}),
					),
					elseBody: luau.list.make(),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.CallStatement, {
							expression: luau.call(luau.globals.table.insert, [rest, keyId]),
						}),
					),
				}),
			),
		}),
	);
	return rest;
}
