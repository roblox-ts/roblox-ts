import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { isBreakBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";

export function transformContinueStatement(state: TransformState, node: ts.ContinueStatement) {
	if (node.label) {
		state.addDiagnostic(diagnostics.noLabeledStatement(node.label));
		return luau.list.make<luau.Statement>();
	}

	if (isBreakBlockedByTryStatement(node)) {
		state.markTryUses("usesContinue");

		return luau.list.make(
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: state.TS("TRY_CONTINUE"),
			}),
		);
	}

	return luau.list.make(luau.create(luau.SyntaxKind.ContinueStatement, {}));
}
