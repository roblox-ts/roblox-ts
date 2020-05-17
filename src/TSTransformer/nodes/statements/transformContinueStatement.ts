import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer/TransformState";

export function transformContinueStatement(state: TransformState, node: ts.ContinueStatement) {
	if (node.label) {
		state.addDiagnostic(diagnostics.noLabeledStatement(node.label));
		return lua.list.make<lua.Statement>();
	}

	return lua.list.make(lua.create(lua.SyntaxKind.ContinueStatement, {}));
}
