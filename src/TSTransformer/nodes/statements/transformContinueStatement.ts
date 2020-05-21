import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { isBreakBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";

export function transformContinueStatement(state: TransformState, node: ts.ContinueStatement) {
	if (node.label) {
		state.addDiagnostic(diagnostics.noLabeledStatement(node.label));
		return lua.list.make<lua.Statement>();
	}

	if (isBreakBlockedByTryStatement(node)) {
		state.markTryUses("usesContinue");

		return lua.list.make(
			lua.create(lua.SyntaxKind.ReturnStatement, {
				expression: state.TS("TRY_CONTINUE"),
			}),
		);
	}

	return lua.list.make(lua.create(lua.SyntaxKind.ContinueStatement, {}));
}
