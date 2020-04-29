import ts from "byots";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { TransformState } from "TSTransformer/TransformState";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";

export function transformDoStatement(state: TransformState, node: ts.DoStatement) {
	const statements = transformStatementList(
		state,
		ts.isBlock(node.statement) ? node.statement.statements : [node.statement],
	);

	const { expression: condition, statements: conditionPrereqs } = state.capturePrereqs(() =>
		createTruthinessChecks(state, transformExpression(state, node.expression), state.getType(node.expression)),
	);

	return lua.list.make(
		lua.create(lua.SyntaxKind.RepeatStatement, {
			statements: lua.list.join(
				lua.list.make(
					lua.create(lua.SyntaxKind.DoStatement, {
						statements,
					}),
				),
				conditionPrereqs,
			),
			condition: lua.create(lua.SyntaxKind.UnaryExpression, {
				operator: "not",
				expression: condition,
			}),
		}),
	);
}
