import ts from "byots";
import { assert } from "Shared/util/assert";

export function getSourceFileFromModuleSpecifier(typeChecker: ts.TypeChecker, moduleSpecifier: ts.Expression) {
	const symbol = typeChecker.getSymbolAtLocation(moduleSpecifier);
	if (symbol) {
		assert(ts.isSourceFile(symbol.valueDeclaration), "symbol.valueDeclaration wasn't a sourceFile");
		return symbol.valueDeclaration;
	}
}
