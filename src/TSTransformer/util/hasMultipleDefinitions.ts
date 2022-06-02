import ts from "typescript";

export function hasMultipleDefinitions(symbol: ts.Symbol, filter: (declaration: ts.Declaration) => boolean): boolean {
	let amtValueDefinitions = 0;
	for (const declaration of symbol.getDeclarations() ?? []) {
		if (filter(declaration)) {
			amtValueDefinitions++;
			if (amtValueDefinitions > 1) {
				return true;
			}
		}
	}
	return false;
}
