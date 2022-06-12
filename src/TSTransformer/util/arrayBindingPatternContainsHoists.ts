import { TransformState } from "TSTransformer/classes/TransformState";
import { checkVariableHoist } from "TSTransformer/util/checkVariableHoist";
import ts from "typescript";

export function arrayBindingPatternContainsHoists(
	state: TransformState,
	arrayBindingPattern: ts.ArrayBindingPattern,
): boolean {
	for (const element of arrayBindingPattern.elements) {
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
