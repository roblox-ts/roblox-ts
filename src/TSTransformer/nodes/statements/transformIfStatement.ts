import ts from "byots";
import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { TransformState } from "TSTransformer/TransformState";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";

export function transformIfStatementInner(state: TransformState, node: ts.IfStatement): lua.IfStatement {
	const condition = createTruthinessChecks(
		state,
		transformExpression(state, node.expression),
		state.getType(node.expression),
	);

	const statements = transformStatementList(state, getStatements(node.thenStatement));

	let elseBody: lua.IfStatement | lua.List<lua.Statement>;
	if (node.elseStatement === undefined) {
		elseBody = lua.list.make<lua.Statement>();
	} else if (ts.isIfStatement(node.elseStatement)) {
		elseBody = transformIfStatementInner(state, node.elseStatement);
	} else if (ts.isBlock(node.elseStatement)) {
		elseBody = transformStatementList(state, node.elseStatement.statements);
	} else {
		elseBody = transformStatement(state, node.elseStatement);
	}

	return lua.create(lua.SyntaxKind.IfStatement, {
		condition,
		statements,
		elseBody,
	});
}

export function transformIfStatement(state: TransformState, node: ts.IfStatement) {
	return lua.list.make(transformIfStatementInner(state, node));
}
