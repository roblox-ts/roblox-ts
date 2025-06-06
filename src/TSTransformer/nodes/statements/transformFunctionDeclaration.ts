import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import { wrapStatementsAsGenerator } from "TSTransformer/util/wrapStatementsAsGenerator";
import ts from "typescript";

export function transformFunctionDeclaration(state: TransformState, node: ts.FunctionDeclaration) {
	if (!node.body) {
		return luau.list.make<luau.Statement>();
	}

	const isExportDefault = ts.hasSyntacticModifier(node, ts.ModifierFlags.ExportDefault);

	assert(node.name || isExportDefault);

	if (node.name) {
		validateIdentifier(state, node.name);
	}

	const name = node.name ? transformIdentifierDefined(state, node.name) : luau.id("default");

	let { statements, parameters, hasDotDotDot } = transformParameters(state, node);
	luau.list.pushList(statements, transformStatementList(state, node.body, node.body.statements));

	let localize = isExportDefault;
	if (node.name) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(symbol);
		localize = state.isHoisted.get(symbol) !== true;
	}

	const isAsync = ts.hasSyntacticModifier(node, ts.ModifierFlags.Async);

	if (node.asteriskToken) {
		if (isAsync) {
			DiagnosticService.addDiagnostic(errors.noAsyncGeneratorFunctions(node));
		}
		statements = wrapStatementsAsGenerator(state, node, statements);
	}

	if (isAsync) {
		const right = luau.call(state.TS(node, "async"), [
			luau.create(luau.SyntaxKind.FunctionExpression, {
				hasDotDotDot,
				parameters,
				statements,
			}),
		]);
		if (localize) {
			return luau.list.make(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: name,
					right,
				}),
			);
		} else {
			return luau.list.make(
				luau.create(luau.SyntaxKind.Assignment, {
					left: name,
					operator: "=",
					right,
				}),
			);
		}
	} else {
		return luau.list.make(
			luau.create(luau.SyntaxKind.FunctionDeclaration, { localize, name, statements, parameters, hasDotDotDot }),
		);
	}
}
