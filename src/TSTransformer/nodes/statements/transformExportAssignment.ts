import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";

function transformExportEquals(state: TransformState, node: ts.ExportAssignment) {
	const symbol = state.typeChecker.getSymbolAtLocation(node.expression);
	if (symbol && isDefinedAsLet(state, symbol)) {
		state.addDiagnostic(diagnostics.noExportAssignmentLet(node));
	}

	return lua.list.make<lua.Statement>(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: state.getModuleIdFromNode(node),
			right: transformExpression(state, node.expression),
		}),
	);
}

function transformExportDefault(state: TransformState, node: ts.ExportAssignment) {
	return lua.list.make<lua.Statement>(
		lua.create(lua.SyntaxKind.Assignment, {
			left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: state.getModuleIdFromNode(node),
				name: "default",
			}),
			right: transformExpression(state, node.expression),
		}),
	);
}

export function transformExportAssignment(state: TransformState, node: ts.ExportAssignment) {
	if (node.isExportEquals) {
		return transformExportEquals(state, node);
	} else {
		return transformExportDefault(state, node);
	}
}
