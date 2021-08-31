import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";
import ts from "typescript";

export function transformDoStatement(state: TransformState, node: ts.DoStatement) {
	const statements = transformStatementList(state, getStatements(node.statement));

	const [condition, conditionPrereqs] = state.capture(() =>
		createTruthinessChecks(
			state,
			transformExpression(state, node.expression),
			node.expression,
			state.getType(node.expression),
		),
	);

	const repeatStatements = luau.list.make<luau.Statement>();
	luau.list.push(
		repeatStatements,
		luau.create(luau.SyntaxKind.DoStatement, {
			statements,
		}),
	);
	luau.list.pushList(repeatStatements, conditionPrereqs);

	return luau.list.make(
		luau.create(luau.SyntaxKind.RepeatStatement, {
			statements: repeatStatements,
			condition: luau.unary("not", condition),
		}),
	);
}
