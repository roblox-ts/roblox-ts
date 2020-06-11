import ts from "byots";
import { TransformState } from "TSTransformer";

export function isSymbolOfValue(symbol: ts.Symbol) {
	return !!(symbol.flags & ts.SymbolFlags.Value) && !(symbol.flags & ts.SymbolFlags.ConstEnum);
}

export function isReferenceOfValue(state: TransformState, aliasSymbol: ts.Symbol) {
	if (aliasSymbol.isReferenced !== undefined && !!(aliasSymbol.isReferenced & ts.SymbolFlags.ValueModule)) {
		if (isSymbolOfValue(ts.skipAlias(aliasSymbol, state.typeChecker))) {
			return true;
		}
	}
	return false;
}
