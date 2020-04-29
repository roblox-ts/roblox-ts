import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import { diagnostics } from "TSTransformer/diagnostics";

export function transformContinueStatement(state: TransformState, node: ts.ContinueStatement) {
	if (node.label) {
		state.addDiagnostic(diagnostics.noLabeledStatement(node.label));
		return lua.list.make<lua.Statement>();
	}

	return lua.list.make(lua.create(lua.SyntaxKind.ContinueStatement, {}));
}
