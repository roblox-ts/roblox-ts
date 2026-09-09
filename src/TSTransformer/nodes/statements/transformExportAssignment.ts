import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import ts from "typescript";

function transformExportEquals(state: TransformState, node: ts.ExportAssignment) {
	state.hasExportEquals = true;

	const statements = luau.list.make<luau.Statement>();
	const prereqs = new Prereqs();
	let statement: luau.Statement;

	const sourceFile = node.getSourceFile();
	const finalStatement = sourceFile.statements[sourceFile.statements.length - 1];
	if (finalStatement === node) {
		statement = luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: transformExpression(state, prereqs, node.expression),
		});
	} else {
		statement = luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: state.getModuleIdFromNode(node),
			right: transformExpression(state, prereqs, node.expression),
		});
	}

	luau.list.pushList(statements, prereqs.statements);
	luau.list.push(statements, statement);
	return statements;
}

function transformExportDefault(state: TransformState, node: ts.ExportAssignment) {
	const statements = luau.list.make<luau.Statement>();

	const expressionPrereqs = new Prereqs();
	const expression = transformExpression(state, expressionPrereqs, node.expression);
	luau.list.pushList(statements, expressionPrereqs.statements);
	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: luau.id("default"),
			right: expression,
		}),
	);

	return statements;
}

export function transformExportAssignment(state: TransformState, node: ts.ExportAssignment) {
	const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
	if (symbol && isSymbolMutable(state, symbol)) {
		DiagnosticService.addDiagnostic(errors.noExportAssignmentLet(node));
	}

	if (symbol && !isSymbolOfValue(ts.skipAlias(symbol, state.typeChecker))) {
		return luau.list.make<luau.Statement>();
	}

	if (node.isExportEquals) {
		return transformExportEquals(state, node);
	} else {
		return transformExportDefault(state, node);
	}
}
