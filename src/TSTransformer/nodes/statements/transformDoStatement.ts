import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";

export function transformDoStatement(state: TransformState, node: ts.DoStatement) {
	const statements = transformStatementList(state, getStatements(node.statement));

	const [condition, conditionPrereqs] = state.capture(() =>
		createTruthinessChecks(state, transformExpression(state, node.expression), state.getType(node.expression)),
	);

	return luau.list.make(
		luau.create(luau.SyntaxKind.RepeatStatement, {
			statements: luau.list.join(
				luau.list.make(
					luau.create(luau.SyntaxKind.DoStatement, {
						statements,
					}),
				),
				conditionPrereqs,
			),
			condition: luau.unary("not", condition),
		}),
	);
}
