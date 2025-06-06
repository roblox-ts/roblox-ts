import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { LoopLabel } from "TSTransformer/types";
import { isBreakBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";
import ts from "typescript";

export function transformBreakStatement(state: TransformState, node: ts.BreakStatement) {
	const breakBlockedByTryStatement = isBreakBlockedByTryStatement(node);

	if (node.label && breakBlockedByTryStatement) {
		DiagnosticService.addDiagnostic(errors.noLabeledStatementsWithinTryCatch(node.label));
		return luau.list.make<luau.Statement>();
	}

	if (node.label && state.shouldGenerateLabelAssignment(node.label.text)) {
		const id = state.getLoopLabelIdByName(node.label.text);
		assert(id);

		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: id as never,
				operator: "=",
				right: luau.string(LoopLabel.break),
			}),
		);
	}

	if (breakBlockedByTryStatement) {
		state.markTryUses("usesBreak");

		return luau.list.make(
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: state.TS(node, "TRY_BREAK"),
			}),
		);
	}

	return luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {}));
}
