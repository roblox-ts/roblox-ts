import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";

export function spreadDestructureObject(
	state: TransformState,
	parentId: luau.AnyIdentifier,
	preSpreadNames: Array<luau.Expression>,
) {
	const extracted = state.pushToVar(
		luau.set(
			preSpreadNames.map(expression => {
				if (luau.isPropertyAccessExpression(expression)) return luau.string(expression.name);
				if (luau.isComputedIndexExpression(expression)) return expression.index;

				assert(false, "Unknown expression type");
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
