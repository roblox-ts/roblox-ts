import ts from "byots";
import path from "path";
import { isSomeType } from "TSTransformer/util/types";
import { assert } from "Shared/util/assert";

export const ROACT_SYMBOL_NAMES = {
	Component: "Component",
	PureComponent: "PureComponent",
	Fragment: "Fragment",
	Element: "Element",
};

function getChildByNameOrThrow(children: ReadonlyArray<ts.Node>, childName: string) {
	for (const child of children) {
		let name: string | undefined;
		if (ts.isModuleDeclaration(child)) {
			name = child.name.text;
		} else if (ts.isInterfaceDeclaration(child)) {
			name = child.name.text;
		} else if (ts.isVariableStatement(child)) {
			const nameNode = child.declarationList.declarations[0].name;
			assert(ts.isIdentifier(nameNode), "Child's name wasn't an identifier");
			name = nameNode.text;
		} else if (ts.isPropertySignature(child)) {
			assert(ts.isIdentifier(child.name), "Child's name wasn't an identifier");
			name = child.name.text;
		}
		if (name !== undefined && name === childName) {
			return child;
		}
	}
	assert(false, `Could not find child named "${childName}"`);
}

export class RoactSymbolManager {
	private readonly symbols = new Map<string, ts.Symbol>();
	public readonly jsxIntrinsicNameMap = new Map<ts.Symbol, string>();

	constructor(typeChecker: ts.TypeChecker, roactIndexSourceFile: ts.SourceFile) {
		const roactNamespace = getChildByNameOrThrow(roactIndexSourceFile.statements, "Roact");
		assert(
			ts.isModuleDeclaration(roactNamespace) && roactNamespace.body && ts.isModuleBlock(roactNamespace.body),
			"Roact index sourceFile wasn't a module",
		);

		const addSymbolFromNode = (name: string, node: ts.Node) => {
			const symbol = typeChecker.getSymbolAtLocation(node);
			assert(symbol, "Could not find symbol for node");
			assert(!this.symbols.has(name), `symbols already contains ${name}`);
			this.symbols.set(name, symbol);
		};

		// "Component", "PureComponent", "Fragment"
		const roactSymbolNameSet = new Set(Object.values(ROACT_SYMBOL_NAMES));
		for (const statement of roactNamespace.body.statements) {
			if (ts.isInterfaceDeclaration(statement)) {
				if (roactSymbolNameSet.has(statement.name.text)) {
					addSymbolFromNode(statement.name.text, statement.name);
				}
			} else if (ts.isClassDeclaration(statement) && statement.name) {
				if (roactSymbolNameSet.has(statement.name.text)) {
					addSymbolFromNode(statement.name.text, statement.name);
				}
			} else if (ts.isVariableStatement(statement)) {
				const nameNode = statement.declarationList.declarations[0].name;
				assert(ts.isIdentifier(nameNode), "Child's name wasn't an identifier");
				if (roactSymbolNameSet.has(nameNode.text)) {
					addSymbolFromNode(nameNode.text, nameNode);
				}
			}
		}

		// verify all expected symbols exist
		for (const symbolName of Object.keys(ROACT_SYMBOL_NAMES)) {
			this.getSymbolOrThrow(symbolName);
		}

		// JSX intrinsic elements
		for (const symbol of typeChecker.getJsxIntrinsicTagNamesAt(roactIndexSourceFile)) {
			assert(
				ts.isPropertySignature(symbol.valueDeclaration),
				"Symbol.valueDeclaration wasn't a property signature",
			);
			assert(
				symbol.valueDeclaration.type && ts.isTypeReferenceNode(symbol.valueDeclaration.type),
				"symbol.valueDeclaration.type wasn't a TypeReference",
			);
			const className = symbol.valueDeclaration.type.typeArguments?.[0].getText();
			assert(className, "className had no text");
			this.jsxIntrinsicNameMap.set(symbol, className);
		}
	}

	public getSymbolOrThrow(symbolName: string): ts.Symbol {
		const symbol = this.symbols.get(symbolName);
		assert(symbol, `Could not find symbol for ${symbolName}`);
		return symbol;
	}

	public getIntrinsicElementClassNameFromSymbol(symbol: ts.Symbol) {
		return this.jsxIntrinsicNameMap.get(symbol);
	}

	public isElementType(type: ts.Type) {
		const symbol = this.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Element);
		return isSomeType(type, t => t.symbol === symbol);
	}
}
