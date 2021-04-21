import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isBreakBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";

export function transformContinueStatement(state: TransformState, node: ts.ContinueStatement) {
	if (node.label) {
		DiagnosticService.addDiagnostic(errors.noLabeledStatement(node.label));
		return luau.list.make<luau.Statement>();
	}

	if (isBreakBlockedByTryStatement(node)) {
		state.markTryUses("usesContinue");

		return luau.list.make(
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: state.TS(node, "TRY_CONTINUE"),
			}),
		);
	}

	return luau.list.make(luau.create(luau.SyntaxKind.ContinueStatement, {}));
}
