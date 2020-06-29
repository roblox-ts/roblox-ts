import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { isBreakBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";

export function transformBreakStatement(state: TransformState, node: ts.BreakStatement) {
	if (node.label) {
		state.addDiagnostic(diagnostics.noLabeledStatement(node.label));
		return luau.list.make<luau.Statement>();
	}

	if (isBreakBlockedByTryStatement(node)) {
		state.markTryUses("usesBreak");

		return luau.list.make(
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: state.TS("TRY_BREAK"),
			}),
		);
	}

	return luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {}));
}
