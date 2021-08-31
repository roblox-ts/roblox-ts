import ts from "typescript";
import { assert } from "Shared/util/assert";

export function getSourceFileFromModuleSpecifier(typeChecker: ts.TypeChecker, moduleSpecifier: ts.Expression) {
	const symbol = typeChecker.getSymbolAtLocation(moduleSpecifier);
	if (symbol) {
		assert(symbol.valueDeclaration && ts.isSourceFile(symbol.valueDeclaration));
		return symbol.valueDeclaration;
	}
}
