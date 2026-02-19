import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { LoopLabel } from "TSTransformer/types";
import { isBreakBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";
import ts from "typescript";

export function transformContinueStatement(state: TransformState, node: ts.ContinueStatement) {
	const breakBlockedByTryStatement = isBreakBlockedByTryStatement(node);
	if (node.label && breakBlockedByTryStatement) {
		DiagnosticService.addDiagnostic(errors.noLabeledStatementsWithinTryCatch(node.label));
		return luau.list.make<luau.Statement>();
	}

	if (node.label && state.shouldGenerateLabelAssignment(node.label.text)) {
		const labelData = state.getLoopLabelDataByName(node.label.text);
		assert(labelData);

		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: labelData.id,
				operator: "=",
				right: luau.string(LoopLabel.continue),
			}),
		);

		labelData.everContinued = true;
		return luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {}));
	}

	if (breakBlockedByTryStatement) {
		state.markTryUses("usesContinue");

		return luau.list.make(
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: state.TS(node, "TRY_CONTINUE"),
			}),
		);
	}

	return luau.list.make(luau.create(luau.SyntaxKind.ContinueStatement, {}));
}
