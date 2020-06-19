import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { isSymbolOfValue } from "TSTransformer/util/isSymbolOfValue";

function transformExportEquals(state: TransformState, node: ts.ExportAssignment) {
	const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
	if (symbol && isDefinedAsLet(state, symbol)) {
		state.addDiagnostic(diagnostics.noExportAssignmentLet(node));
	}

	if (symbol && isSymbolOfValue(symbol)) {
		return lua.list.make<lua.Statement>();
	}

	state.hasExportEquals = true;

	const sourceFile = node.getSourceFile();
	const finalStatement = sourceFile.statements[sourceFile.statements.length - 1];
	if (finalStatement === node) {
		return lua.list.make<lua.Statement>(
			lua.create(lua.SyntaxKind.ReturnStatement, { expression: transformExpression(state, node.expression) }),
		);
	} else {
		return lua.list.make<lua.Statement>(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: state.getModuleIdFromNode(node),
				right: transformExpression(state, node.expression),
			}),
		);
	}
}

function transformExportDefault(state: TransformState, node: ts.ExportAssignment) {
	const statements = lua.list.make<lua.Statement>();

	const { expression, statements: expPreqreqs } = state.capture(() => transformExpression(state, node.expression));
	lua.list.pushList(statements, expPreqreqs);
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: lua.id("default"),
			right: expression,
		}),
	);

	return statements;
}

export function transformExportAssignment(state: TransformState, node: ts.ExportAssignment) {
	if (node.isExportEquals) {
		return transformExportEquals(state, node);
	} else {
		return transformExportDefault(state, node);
	}
}
