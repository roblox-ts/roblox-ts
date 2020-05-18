import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";

function transformExportEquals(state: TransformState, node: ts.ExportAssignment) {
	const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
	if (symbol && isDefinedAsLet(state, symbol)) {
		state.addDiagnostic(diagnostics.noExportAssignmentLet(node));
	}

	if (symbol && !(symbol.flags & ts.SymbolFlags.Value)) {
		return lua.list.make<lua.Statement>();
	}

	state.hasExportEquals = true;

	return lua.list.make<lua.Statement>(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: state.getModuleIdFromNode(node),
			right: transformExpression(state, node.expression),
		}),
	);
}

export function transformExportAssignment(state: TransformState, node: ts.ExportAssignment) {
	if (node.isExportEquals) {
		return transformExportEquals(state, node);
	}
	return lua.list.make<lua.Statement>();
}
