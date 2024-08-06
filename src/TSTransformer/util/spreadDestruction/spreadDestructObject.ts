import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";

export function spreadDestructObject(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	preSpreadNames: Array<luau.Expression>,
) {
	const extracted = state.pushToVar(
		luau.set(
			preSpreadNames.map(expression => {
				return luau.isPropertyAccessExpression(expression) ? luau.string(expression.name) : expression;
			}),
		),
		"extracted",
	);
	const rest = state.pushToVar(luau.map(), "rest");
	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");

	const loop = luau.create(luau.SyntaxKind.ForStatement, {
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
	});
	state.prereq(loop);
	return rest;
}