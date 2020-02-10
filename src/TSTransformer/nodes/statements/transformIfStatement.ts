import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatement } from "TSTransformer/nodes/statements/transformStatement";
import { TransformState } from "TSTransformer/TransformState";
import { wrapConditional } from "TSTransformer/util/wrapConditional";
import { transformStatementList } from "TSTransformer/util/transformStatementList";
import ts from "typescript";

function transformElseStatement(
	state: TransformState,
	elseStatement: ts.Statement | undefined,
): lua.IfStatement | lua.List<lua.Statement> {
	if (elseStatement === undefined) {
		return lua.list.make<lua.Statement>();
	} else if (ts.isIfStatement(elseStatement)) {
		return transformIfStatementInner(state, elseStatement);
	} else if (ts.isBlock(elseStatement)) {
		return transformStatementList(state, elseStatement.statements);
	} else {
		return transformStatement(state, elseStatement);
	}
}

export function transformIfStatementInner(state: TransformState, node: ts.IfStatement) {
	const condition = wrapConditional(
		state,
		transformExpression(state, node.expression),
		state.typeChecker.getTypeAtLocation(node.expression),
	);

	const statements = transformStatementList(
		state,
		ts.isBlock(node.thenStatement) ? node.thenStatement.statements : [node.thenStatement],
	);

	const elseBody = transformElseStatement(state, node.elseStatement);

	return lua.create(lua.SyntaxKind.IfStatement, {
		condition,
		statements,
		elseBody,
	});
}

export function transformIfStatement(state: TransformState, node: ts.IfStatement) {
	return lua.list.make(transformIfStatementInner(state, node));
}
