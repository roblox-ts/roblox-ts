import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";
import ts from "typescript";

function transformExportEquals(state: TransformState, prereqs: Prereqs, node: ts.ExportAssignment) {
	state.hasExportEquals = true;

	const sourceFile = node.getSourceFile();
	const finalStatement = sourceFile.statements[sourceFile.statements.length - 1];
	if (finalStatement === node) {
		return luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: transformExpression(state, prereqs, node.expression),
			}),
		);
	} else {
		return luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: state.getModuleIdFromNode(node),
				right: transformExpression(state, prereqs, node.expression),
			}),
		);
	}
}

function transformExportDefault(state: TransformState, prereqs: Prereqs, node: ts.ExportAssignment) {
	return luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: luau.id("default"),
			right: transformExpression(state, prereqs, node.expression),
		}),
	);
}

export function transformExportAssignment(state: TransformState, prereqs: Prereqs, node: ts.ExportAssignment) {
	const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
	if (symbol && isSymbolMutable(state, symbol)) {
		DiagnosticService.addDiagnostic(errors.noExportAssignmentLet(node));
	}

	if (symbol && !isSymbolOfValue(ts.skipAlias(symbol, state.typeChecker))) {
		return luau.list.make<luau.Statement>();
	}

	if (node.isExportEquals) {
		return transformExportEquals(state, prereqs, node);
	} else {
		return transformExportDefault(state, prereqs, node);
	}
}
