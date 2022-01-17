import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

export function validateIdentifier(state: TransformState, node: ts.Identifier) {
	if (!luau.isValidIdentifier(node.text)) {
		DiagnosticService.addDiagnostic(errors.noInvalidIdentifier(node));
	} else if (luau.isReservedIdentifier(node.text)) {
		DiagnosticService.addDiagnostic(errors.noReservedIdentifier(node));
	}
}
