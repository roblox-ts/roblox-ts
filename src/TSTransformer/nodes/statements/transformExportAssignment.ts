import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";

function transformExportEquals(state: TransformState, node: ts.ExportAssignment) {
	state.hasExportEquals = true;

	const sourceFile = node.getSourceFile();
	const finalStatement = sourceFile.statements[sourceFile.statements.length - 1];
	if (finalStatement === node) {
		return luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.ReturnStatement, { expression: transformExpression(state, node.expression) }),
		);
	} else {
		return luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: state.getModuleIdFromNode(node),
				right: transformExpression(state, node.expression),
			}),
		);
	}
}

function transformExportDefault(state: TransformState, node: ts.ExportAssignment) {
	const statements = luau.list.make<luau.Statement>();

	const [expression, prereqs] = state.capture(() => transformExpression(state, node.expression));
	luau.list.pushList(statements, prereqs);
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
	if (symbol && isDefinedAsLet(state, symbol)) {
		state.addDiagnostic(diagnostics.noExportAssignmentLet(node));
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
