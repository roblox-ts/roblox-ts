import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";

export function spreadDestructureSet(
	prereqs: Prereqs,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
) {
	const extracted = prereqs.pushToVar(luau.set(idStack), "extracted");
	const rest = prereqs.pushToVar(luau.array(), "rest");
	const keyId = luau.tempId("k");

	prereqs.push(
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(keyId),
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
