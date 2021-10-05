import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isMethod } from "TSTransformer/util/isMethod";
import { isValidMethodIndexWithoutCall } from "TSTransformer/util/isValidMethodIndexWithoutCall";
import { skipUpwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import ts from "typescript";

export function addIndexDiagnostics(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.SignatureDeclarationBase,
	expType: ts.Type,
) {
	const symbol = getFirstDefinedSymbol(state, expType);
	if (
		(symbol && state.services.macroManager.getPropertyCallMacro(symbol)) ||
		(!isValidMethodIndexWithoutCall(skipUpwards(node).parent) && isMethod(state, node))
	) {
		DiagnosticService.addDiagnostic(errors.noIndexWithoutCall(node));
		return luau.emptyId();
	}

	if (ts.isPrototypeAccess(node)) {
		DiagnosticService.addDiagnostic(errors.noPrototype(node));
	}
}
