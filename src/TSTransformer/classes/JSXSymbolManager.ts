import ts from "typescript";

const JSX_NAMESPACE_NAME = "JSX";

export enum JSXSymbolNames {
	Element = "Element",
}

export class JSXSymbolManager {
	private readonly symbols = new Map<string, ts.Symbol>();

	constructor(typeChecker: ts.TypeChecker) {
		const jsxNamespaceSymbol = typeChecker.resolveName(
			JSX_NAMESPACE_NAME,
			undefined,
			ts.SymbolFlags.Namespace,
			false,
		);
		if (jsxNamespaceSymbol && jsxNamespaceSymbol.exports) {
			const elementSymbol = jsxNamespaceSymbol.exports.get(ts.escapeLeadingUnderscores(JSXSymbolNames.Element));
			if (elementSymbol) {
				// TODO: is there a better way to get the "root" symbol?
				const declaration = elementSymbol.declarations?.[0];
				if (declaration && ts.isTypeAliasDeclaration(declaration)) {
					const symbol = typeChecker.getTypeFromTypeNode(declaration.type).symbol;
					this.symbols.set(JSXSymbolNames.Element, symbol);
				} else {
					this.symbols.set(JSXSymbolNames.Element, elementSymbol);
				}
			}
		}
	}

	public getSymbol(name: string) {
		return this.symbols.get(name);
	}
}
