import { TransformState } from "TSTransformer/classes/TransformState";
import { checkVariableHoist } from "TSTransformer/util/checkVariableHoist";
import ts from "typescript";

export function arrayBindingPatternContainsHoists(
	state: TransformState,
	arrayBindingPattern: ts.ArrayBindingPattern,
): boolean {
	for (const element of arrayBindingPattern.elements) {
		// If it's not a ts.BindingElement, it must be a ts.OmittedExpression. In that case, doesn't create a variable.
		// For non-identifiers, element.name must be a nested array/object binding pattern.
		// For those cases, the hoisting logic is handled elsewhere and the variable here will be a tempId.
		if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
			const symbol = state.typeChecker.getSymbolAtLocation(element.name);
			if (symbol) {
				// isHoisted is marked inside checkVariableHoist
				checkVariableHoist(state, element.name, symbol);
				if (state.isHoisted.get(symbol)) {
					return true;
				}
			}
		}
	}
	return false;
}
