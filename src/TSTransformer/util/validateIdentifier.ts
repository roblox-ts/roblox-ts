import ts from "byots";
import { errors } from "Shared/diagnostics";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";
import { TransformState } from "TSTransformer";

export function validateIdentifier(state: TransformState, node: ts.Identifier) {
	if (!isValidLuauIdentifier(node.text)) {
		state.addDiagnostic(errors.noReservedIdentifier(node));
	}
}
