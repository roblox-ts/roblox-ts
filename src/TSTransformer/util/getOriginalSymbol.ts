import ts from "typescript";

export function getOriginalSymbol(typeChecker: ts.TypeChecker, symbol: ts.Symbol) {
	if (!!(symbol.flags & ts.SymbolFlags.Alias)) {
		return typeChecker.getAliasedSymbol(symbol);
	}
	return symbol;
}
