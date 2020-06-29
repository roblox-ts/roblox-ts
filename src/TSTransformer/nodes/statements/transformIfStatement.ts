import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";

export function transformIfStatementInner(state: TransformState, node: ts.IfStatement): luau.IfStatement {
	const condition = createTruthinessChecks(
		state,
		transformExpression(state, node.expression),
		state.getType(node.expression),
	);

	const statements = transformStatementList(state, getStatements(node.thenStatement));

	let elseBody: luau.IfStatement | luau.List<luau.Statement>;
	if (node.elseStatement === undefined) {
		elseBody = luau.list.make<luau.Statement>();
	} else if (ts.isIfStatement(node.elseStatement)) {
		elseBody = transformIfStatementInner(state, node.elseStatement);
	} else if (ts.isBlock(node.elseStatement)) {
		elseBody = transformStatementList(state, node.elseStatement.statements);
	} else {
		elseBody = transformStatement(state, node.elseStatement);
	}

	return luau.create(luau.SyntaxKind.IfStatement, {
		condition,
		statements,
		elseBody,
	});
}

export function transformIfStatement(state: TransformState, node: ts.IfStatement) {
	return luau.list.make(transformIfStatementInner(state, node));
}
