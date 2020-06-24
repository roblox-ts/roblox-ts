import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformReturnStatementInner } from "TSTransformer/nodes/statements/transformReturnStatement";
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
		const { expression: returnStatement, statements: prereqs } = state.capture(() =>
			transformReturnStatementInner(state, body),
		);
		lua.list.pushList(statements, prereqs);
		lua.list.push(statements, returnStatement);
	}

	let expression: lua.Expression = lua.create(lua.SyntaxKind.FunctionExpression, {
		hasDotDotDot,
		parameters,
		statements,
	});

	if (!!(node.modifierFlagsCache & ts.ModifierFlags.Async)) {
		expression = lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS("async"),
			args: lua.list.make(expression),
		});
	}

	return expression;
}
