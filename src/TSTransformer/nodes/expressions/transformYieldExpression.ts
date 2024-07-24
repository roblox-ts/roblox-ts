import luau from "@roblox-ts/luau-ast";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import ts from "typescript";

export function transformYieldExpression(state: TransformState, prereqs: Prereqs, node: ts.YieldExpression) {
	if (!node.expression) {
		return luau.call(luau.globals.coroutine.yield, []);
	}

	const expression = transformExpression(state, prereqs, node.expression);
	if (node.asteriskToken) {
		const loopId = luau.tempId("result");

		const finalizer = luau.list.make<luau.Statement>(luau.create(luau.SyntaxKind.BreakStatement, {}));
		let evaluated: luau.Expression = luau.none();

		if (!isUsedAsStatement(node)) {
			const returnValue = prereqs.pushToVar(undefined, "returnValue");
			luau.list.unshift(
				finalizer,
				luau.create(luau.SyntaxKind.Assignment, {
					left: returnValue,
					operator: "=",
					right: luau.property(loopId, "value"),
				}),
			);
			evaluated = returnValue;
		}

		prereqs.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(loopId),
				expression: luau.property(convertToIndexableExpression(expression), "next"),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.property(loopId, "done"),
						statements: finalizer,
						elseBody: luau.list.make(),
					}),
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(luau.globals.coroutine.yield, [luau.property(loopId, "value")]),
					}),
				),
			}),
		);

		return evaluated;
	} else {
		return luau.call(luau.globals.coroutine.yield, [expression]);
	}
}
