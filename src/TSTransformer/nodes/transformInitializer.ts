import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformInitializer(state: TransformState, id: luau.WritableExpression, initializer: ts.Expression) {
	return luau.create(luau.SyntaxKind.IfStatement, {
		condition: luau.binary(id, "==", luau.nil()),
		elseBody: luau.list.make(),
		statements: state.capturePrereqs(() => {
			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: id,
					operator: "=",
					right: transformExpression(state, initializer),
				}),
			);
		}),
	});
}
