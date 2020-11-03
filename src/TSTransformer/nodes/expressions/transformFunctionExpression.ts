import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformReturnStatementInner } from "TSTransformer/nodes/statements/transformReturnStatement";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { wrapStatementsAsGenerator } from "TSTransformer/util/wrapStatementsAsGenerator";

export function transformFunctionExpression(state: TransformState, node: ts.FunctionExpression | ts.ArrowFunction) {
	if (node.name) {
		state.addDiagnostic(errors.noFunctionExpressionName(node.name));
	}

	// eslint-disable-next-line prefer-const
	let { statements, parameters, hasDotDotDot } = transformParameters(state, node);

	const body = node.body;
	if (ts.isFunctionBody(body)) {
		luau.list.pushList(statements, transformStatementList(state, body.statements));
	} else {
		const [returnStatement, prereqs] = state.capture(() => transformReturnStatementInner(state, body));
		luau.list.pushList(statements, prereqs);
		luau.list.push(statements, returnStatement);
	}

	const isAsync = !!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.Async);

	if (node.asteriskToken) {
		if (isAsync) {
			state.addDiagnostic(errors.noAsyncGeneratorFunctions(node));
		}
		statements = wrapStatementsAsGenerator(state, statements);
	}

	let expression: luau.Expression = luau.create(luau.SyntaxKind.FunctionExpression, {
		hasDotDotDot,
		parameters,
		statements,
	});

	if (isAsync) {
		expression = luau.call(state.TS("async"), [expression]);
	}

	return expression;
}
