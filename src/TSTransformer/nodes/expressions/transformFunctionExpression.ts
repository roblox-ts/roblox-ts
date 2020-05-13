import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";

export function transformFunctionExpression(state: TransformState, node: ts.FunctionExpression | ts.ArrowFunction) {
	if (node.name) {
		state.addDiagnostic(diagnostics.noFunctionExpressionName(node.name));
	}

	const { statements, parameters, hasDotDotDot } = transformParameters(state, node);

	const body = node.body;
	if (ts.isFunctionBody(body)) {
		lua.list.pushList(statements, transformStatementList(state, body.statements));
	} else {
		const { expression, statements: expressionPrereqs } = state.capture(() => transformExpression(state, body));
		lua.list.pushList(statements, expressionPrereqs);
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression,
			}),
		);
	}

	return lua.create(lua.SyntaxKind.FunctionExpression, { statements, parameters, hasDotDotDot });
}
