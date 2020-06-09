import ts from "byots";

export function isSymbolOfValue(symbol: ts.Symbol) {
	return !!(symbol.flags & ts.SymbolFlags.Value) && !(symbol.flags & ts.SymbolFlags.ConstEnum);
}
