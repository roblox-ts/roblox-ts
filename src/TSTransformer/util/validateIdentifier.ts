import ts from "byots";
import { errors } from "Shared/diagnostics";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";
import { isReservedLuauIdentifier } from "Shared/util/isReservedLuauIdentifier";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";

export function validateIdentifier(state: TransformState, node: ts.Identifier) {
	if (!isValidLuauIdentifier(node.text)) {
		DiagnosticService.addDiagnostic(errors.noInvalidIdentifier(node));
	} else if (isReservedLuauIdentifier(node.text)) {
		DiagnosticService.addDiagnostic(errors.noReservedIdentifier(node));
	}
}
