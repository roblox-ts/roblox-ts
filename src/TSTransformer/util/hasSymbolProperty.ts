import ts from "typescript";

export function hasSymbolProperty(type: ts.Type, symbolName: string) {
	return type
		.getProperties()
		.some(property => ts.isKnownSymbol(property) && property.name.startsWith(`__@${symbolName}`));
}
