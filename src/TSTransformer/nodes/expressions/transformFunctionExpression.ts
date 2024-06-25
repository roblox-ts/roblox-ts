import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformReturnStatementInner } from "TSTransformer/nodes/statements/transformReturnStatement";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { wrapStatementsAsGenerator } from "TSTransformer/util/wrapStatementsAsGenerator";
import ts from "typescript";

export function transformFunctionExpression(state: TransformState, node: ts.FunctionExpression | ts.ArrowFunction) {
	if (node.name) {
		DiagnosticService.addDiagnostic(errors.noFunctionExpressionName(node.name));
	}

	// eslint-disable-next-line no-autofix/prefer-const
	let { statements, parameters, hasDotDotDot } = transformParameters(state, node);

	const body = node.body;
	if (ts.isFunctionBody(body)) {
		luau.list.pushList(statements, transformStatementList(state, body, body.statements));
	} else {
		const prereqs = new Prereqs();
		const returnStatements = transformReturnStatementInner(state, prereqs, body);
		luau.list.pushList(statements, prereqs.statements);
		luau.list.pushList(statements, returnStatements);
	}

	const isAsync = !!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.Async);

	if (node.asteriskToken) {
		if (isAsync) {
			DiagnosticService.addDiagnostic(errors.noAsyncGeneratorFunctions(node));
		}
		statements = wrapStatementsAsGenerator(state, node, statements);
	}

	let expression: luau.Expression = luau.create(luau.SyntaxKind.FunctionExpression, {
		hasDotDotDot,
		parameters,
		statements,
	});

	if (isAsync) {
		expression = luau.call(state.TS(node, "async"), [expression]);
	}

	return expression;
}
