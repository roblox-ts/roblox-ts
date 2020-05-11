import ts from "byots";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { TransformState } from "TSTransformer/TransformState";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";

export function transformWhileStatementInner(state: TransformState, condition: ts.Expression, statement: ts.Statement) {
	const statements = transformStatementList(state, getStatements(statement));

	const { expression: conditionExp, statements: conditionPrereqs } = state.capturePrereqs(() =>
		createTruthinessChecks(state, transformExpression(state, condition), state.getType(condition)),
	);

	if (lua.list.isEmpty(conditionPrereqs)) {
		return lua.create(lua.SyntaxKind.WhileStatement, {
			condition: conditionExp,
			statements,
		});
	} else {
		const whileStatements = lua.list.make<lua.Statement>();
		lua.list.pushList(whileStatements, conditionPrereqs);
		lua.list.push(
			whileStatements,
			lua.create(lua.SyntaxKind.IfStatement, {
				condition: lua.create(lua.SyntaxKind.UnaryExpression, {
					operator: "not",
					expression: conditionExp,
				}),
				statements: lua.list.make(lua.create(lua.SyntaxKind.BreakStatement, {})),
				elseBody: lua.list.make(),
			}),
		);
		lua.list.pushList(whileStatements, statements);

		return lua.create(lua.SyntaxKind.WhileStatement, {
			condition: lua.bool(true),
			statements: whileStatements,
		});
	}
}

export function transformWhileStatement(state: TransformState, node: ts.WhileStatement) {
	return lua.list.make(transformWhileStatementInner(state, node.expression, node.statement));
}
