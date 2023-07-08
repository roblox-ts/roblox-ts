/* eslint-disable no-console */
import assert from "assert";
import ts from "typescript";

const JSX_NAMESPACE_NAME = "JSX";

export enum JSXSymbolNames {
	Element = "Element",
}

export class JSXSymbolManager {
	private readonly symbols = new Map<string, ts.Symbol>();
	private readonly jsxIntrinsicNameMap = new Map<ts.Symbol, string>();

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

		// JSX intrinsic elements
		for (const symbol of typeChecker.getJsxIntrinsicTagNamesAt(undefined!)) {
			assert(symbol.valueDeclaration && ts.isPropertySignature(symbol.valueDeclaration));
			assert(symbol.valueDeclaration.type && ts.isTypeReferenceNode(symbol.valueDeclaration.type));
			const className = symbol.valueDeclaration.type.typeArguments?.[0].getText();
			assert(className);
			this.jsxIntrinsicNameMap.set(ts.skipAlias(symbol, typeChecker), className);
		}
	}

	public getIntrinsicElementClassNameFromSymbol(symbol: ts.Symbol) {
		return this.jsxIntrinsicNameMap.get(symbol);
	}

	public getSymbol(name: string) {
		return this.symbols.get(name);
	}
}
