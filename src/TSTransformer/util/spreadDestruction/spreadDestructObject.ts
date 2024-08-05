import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

export default function spreadDestructObject(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	preSpreadNames: Array<ts.PropertyName>,
) {
	const extracted = state.pushToVar(
		luau.set(
			preSpreadNames.map(name => {
				return luau.string(name.getText());
			}),
		),
		"extracted",
	);
	const rest = state.pushToVar(luau.map(), "rest");
	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");

	state.prereq(
		luau.create(luau.SyntaxKind.ForStatement, {
			ids: luau.list.make(keyId, valueId),
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
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: rest,
								index: keyId,
							}),
							operator: "=",
							right: valueId,
						}),
					),
				}),
			),
		}),
	);
	return rest;
}
