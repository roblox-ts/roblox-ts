import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

export function transformYieldExpression(state: TransformState, node: ts.YieldExpression) {
	if (!node.expression) {
		return luau.call(luau.globals.coroutine.yield, []);
	}

	const expression = transformExpression(state, node.expression);
	if (node.asteriskToken) {
		const loopId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(loopId),
				expression: luau.property(convertToIndexableExpression(expression), "next"),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.property(loopId, "done"),
						statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
						elseBody: luau.list.make(),
					}),
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(luau.globals.coroutine.yield, [luau.property(loopId, "value")]),
					}),
				),
			}),
		);

		return luau.nil();
	} else {
		return luau.call(luau.globals.coroutine.yield, [expression]);
	}
}
