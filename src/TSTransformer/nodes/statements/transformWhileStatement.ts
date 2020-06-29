import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";

export function transformWhileStatementInner(state: TransformState, condition: ts.Expression, statement: ts.Statement) {
	const statements = transformStatementList(state, getStatements(statement));

	const [conditionExp, conditionPrereqs] = state.capture(() =>
		createTruthinessChecks(state, transformExpression(state, condition), state.getType(condition)),
	);

	if (luau.list.isEmpty(conditionPrereqs)) {
		return luau.create(luau.SyntaxKind.WhileStatement, {
			condition: conditionExp,
			statements,
		});
	} else {
		const whileStatements = luau.list.make<luau.Statement>();
		luau.list.pushList(whileStatements, conditionPrereqs);
		luau.list.push(
			whileStatements,
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.unary("not", conditionExp),
				statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
				elseBody: luau.list.make(),
			}),
		);
		luau.list.pushList(whileStatements, statements);

		return luau.create(luau.SyntaxKind.WhileStatement, {
			condition: luau.bool(true),
			statements: whileStatements,
		});
	}
}

export function transformWhileStatement(state: TransformState, node: ts.WhileStatement) {
	return luau.list.make(transformWhileStatementInner(state, node.expression, node.statement));
}
