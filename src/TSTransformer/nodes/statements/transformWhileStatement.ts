import ts from "byots";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { transformStatementList } from "TSTransformer/util/transformStatementList";

export function transformWhileStatement(state: TransformState, node: ts.DoStatement) {
	const statements = transformStatementList(
		state,
		ts.isBlock(node.statement) ? node.statement.statements : [node.statement],
	);

	const { expression: condition, statements: conditionPrereqs } = state.capturePrereqs(() =>
		createTruthinessChecks(
			state,
			transformExpression(state, node.expression),
			state.typeChecker.getTypeAtLocation(node.expression),
		),
	);

	if (lua.list.isEmpty(conditionPrereqs)) {
		return lua.list.make(
			lua.create(lua.SyntaxKind.WhileStatement, {
				condition,
				statements,
			}),
		);
	} else {
		const whileStatements = lua.list.make<lua.Statement>();
		lua.list.pushList(whileStatements, conditionPrereqs);
		lua.list.push(
			whileStatements,
			lua.create(lua.SyntaxKind.IfStatement, {
				condition: lua.create(lua.SyntaxKind.UnaryExpression, {
					operator: "not",
					expression: condition,
				}),
				statements: lua.list.make(lua.create(lua.SyntaxKind.BreakStatement, {})),
				elseBody: lua.list.make(),
			}),
		);
		lua.list.pushList(whileStatements, statements);

		return lua.list.make(
			lua.create(lua.SyntaxKind.WhileStatement, {
				condition: lua.bool(true),
				statements: whileStatements,
			}),
		);
	}
}
