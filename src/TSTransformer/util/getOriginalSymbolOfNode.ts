import ts from "typescript";

export function getOriginalSymbolOfNode(typeChecker: ts.TypeChecker, node: ts.Node) {
	const symbol = typeChecker.getSymbolAtLocation(node);
	if (symbol) {
		return ts.skipAlias(symbol, typeChecker);
	}
	return symbol;
}
