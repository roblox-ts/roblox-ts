import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

export function transformYieldExpression(state: TransformState, node: ts.YieldExpression) {
	const args = luau.list.make<luau.Expression>();

	if (node.expression) {
		const expression = transformExpression(state, node.expression);
		if (node.asteriskToken) {
			const loopId = luau.tempId();
			state.prereq(
				luau.create(luau.SyntaxKind.ForStatement, {
					ids: luau.list.make(loopId),
					expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
						expression: convertToIndexableExpression(expression),
						name: "next",
					}),
					statements: luau.list.make<luau.Statement>(
						luau.create(luau.SyntaxKind.IfStatement, {
							condition: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
								expression: loopId,
								name: "done",
							}),
							statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
							elseBody: luau.list.make(),
						}),
						luau.create(luau.SyntaxKind.CallStatement, {
							expression: luau.create(luau.SyntaxKind.CallExpression, {
								expression: luau.globals.coroutine.yield,
								args: luau.list.make(
									luau.create(luau.SyntaxKind.PropertyAccessExpression, {
										expression: loopId,
										name: "value",
									}),
								),
							}),
						}),
					),
				}),
			);

			return luau.nil();
		} else {
			luau.list.push(args, expression);
		}
	}

	return luau.create(luau.SyntaxKind.CallExpression, { expression: luau.globals.coroutine.yield, args });
}
