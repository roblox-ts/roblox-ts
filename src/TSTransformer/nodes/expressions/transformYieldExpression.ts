import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import ts from "typescript";

export function transformYieldExpression(state: TransformState, node: ts.YieldExpression) {
	if (!node.expression) {
		return luau.call(luau.globals.coroutine.yield, []);
	}

	const expression = transformExpression(state, node.expression);
	if (node.asteriskToken) {
		const iteratorId = state.pushToVar(expression, "iterator");
		const currentInputId = luau.tempId("currentInput");
		const resultId = luau.tempId("result");

		const finalizer = luau.list.make<luau.Statement>(luau.create(luau.SyntaxKind.BreakStatement, {}));
		let evaluated: luau.Expression = luau.none();

		if (!isUsedAsStatement(node)) {
			const returnValue = state.pushToVar(undefined, "returnValue");
			luau.list.unshift(
				finalizer,
				luau.create(luau.SyntaxKind.Assignment, {
					left: returnValue,
					operator: "=",
					right: luau.property(resultId, "value"),
				}),
			);
			evaluated = returnValue;
		}

		const yieldCall = luau.call(luau.globals.coroutine.yield, [luau.property(resultId, "value")]);

		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: currentInputId,
				right: luau.none(),
			}),
		);

		state.prereq(
			luau.create(luau.SyntaxKind.WhileStatement, {
				condition: luau.bool(true),
				statements: luau.list.make<luau.Statement>(
					luau.create(luau.SyntaxKind.VariableDeclaration, {
						left: resultId,
						right: luau.call(luau.property(iteratorId, "next"), [currentInputId]),
					}),
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.property(resultId, "done"),
						statements: finalizer,
						elseBody: luau.list.make(),
					}),
					luau.create(luau.SyntaxKind.Assignment, {
						left: currentInputId,
						operator: "=",
						right: yieldCall,
					}),
				),
			}),
		);

		return evaluated;
	} else {
		return luau.call(luau.globals.coroutine.yield, [expression]);
	}
}
