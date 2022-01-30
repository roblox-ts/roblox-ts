import ts from "typescript";

/**
 * Checks that the symbol represents something with a value at runtime
 * Thus excluding types and const enums
 */
export function isSymbolOfValue(symbol: ts.Symbol) {
	return !!(symbol.flags & ts.SymbolFlags.Value) && !(symbol.flags & ts.SymbolFlags.ConstEnum);
}
