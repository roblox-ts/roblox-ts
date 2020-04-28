import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformParameters } from "TSTransformer/util/transformParameters";
import { transformStatementList } from "TSTransformer/util/transformStatementList";
import ts from "typescript";

export function transformFunctionExpression(state: TransformState, node: ts.FunctionExpression | ts.ArrowFunction) {
	const { statements, parameters, hasDotDotDot } = transformParameters(state, node.parameters);

	if (ts.isFunctionBody(node.body)) {
		lua.list.pushList(statements, transformStatementList(state, node.body.statements));
	} else {
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: transformExpression(state, node.body),
			}),
		);
	}

	return lua.create(lua.SyntaxKind.FunctionExpression, {
		hasDotDotDot,
		parameters,
		statements,
	});
}
