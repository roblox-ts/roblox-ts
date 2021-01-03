import ts from "byots";
import { errors } from "Shared/diagnostics";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";
import { isReservedLuauIdentifier } from "Shared/util/isReservedLuauIdentifier";
import { TransformState } from "TSTransformer";

export function validateIdentifier(state: TransformState, node: ts.Identifier) {
	if (!isValidLuauIdentifier(node.text)) {
		state.addDiagnostic(errors.noInvalidIdentifier(node));
	} else if (isReservedLuauIdentifier(node.text)) {
		state.addDiagnostic(errors.noReservedIdentifier(node));
	}
}
