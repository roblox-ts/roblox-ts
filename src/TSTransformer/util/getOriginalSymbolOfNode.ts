import { getOriginalSymbol } from "TSTransformer/util/getOriginalSymbol";
import ts from "typescript";

export function getOriginalSymbolOfNode(typeChecker: ts.TypeChecker, node: ts.Node) {
	const symbol = typeChecker.getSymbolAtLocation(node);
	if (symbol) {
		return getOriginalSymbol(typeChecker, symbol);
	}
	return symbol;
}
