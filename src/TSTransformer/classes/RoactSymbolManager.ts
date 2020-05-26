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
			assert(ts.isIdentifier(nameNode));
			name = nameNode.text;
		} else if (ts.isPropertySignature(child)) {
			assert(ts.isIdentifier(child.name));
			name = child.name.text;
		}
		if (name !== undefined && name === childName) {
			return child;
		}
	}
	assert(false, `Could not find child named "${childName}"`);
}

export class RoactSymbolManager {
	private readonly typeChecker: ts.TypeChecker;
	private readonly roactIndexSourceFile: ts.SourceFile | undefined;
	private readonly symbols = new Map<string, ts.Symbol>();
	public readonly jsxIntrinsicNameMap = new Map<ts.Symbol, string>();

	private addSymbolFromNode(name: string, node: ts.Node) {
		const symbol = this.typeChecker.getSymbolAtLocation(node);
		assert(symbol);
		assert(!this.symbols.has(name), `symbols already contains ${name}`);
		this.symbols.set(name, symbol);
	}

	constructor(program: ts.Program, typeChecker: ts.TypeChecker, nodeModulesPath: string) {
		this.typeChecker = typeChecker;

		// only continue if @rbxts/roact exists
		this.roactIndexSourceFile = program.getSourceFile(path.join(nodeModulesPath, "roact", "index.d.ts"));
		if (!this.roactIndexSourceFile) return;
		assert(this.roactIndexSourceFile);

		const roactNamespace = getChildByNameOrThrow(this.roactIndexSourceFile.statements, "Roact");
		assert(ts.isModuleDeclaration(roactNamespace) && roactNamespace.body && ts.isModuleBlock(roactNamespace.body));

		// "Component", "PureComponent", "Fragment"
		const roactSymbolNameSet = new Set(Object.values(ROACT_SYMBOL_NAMES));
		for (const statement of roactNamespace.body.statements) {
			if (ts.isInterfaceDeclaration(statement)) {
				if (roactSymbolNameSet.has(statement.name.text)) {
					this.addSymbolFromNode(statement.name.text, statement.name);
				}
			} else if (ts.isClassDeclaration(statement) && statement.name) {
				if (roactSymbolNameSet.has(statement.name.text)) {
					this.addSymbolFromNode(statement.name.text, statement.name);
				}
			} else if (ts.isVariableStatement(statement)) {
				const nameNode = statement.declarationList.declarations[0].name;
				assert(ts.isIdentifier(nameNode));
				if (roactSymbolNameSet.has(nameNode.text)) {
					this.addSymbolFromNode(nameNode.text, nameNode);
				}
			}
		}

		// verify all expected symbols exist
		for (const symbolName of Object.keys(ROACT_SYMBOL_NAMES)) {
			this.getSymbolOrThrow(symbolName);
		}

		// JSX intrinsic elements
		for (const symbol of this.typeChecker.getJsxIntrinsicTagNamesAt(this.roactIndexSourceFile)) {
			assert(ts.isPropertySignature(symbol.valueDeclaration));
			assert(symbol.valueDeclaration.type && ts.isTypeReferenceNode(symbol.valueDeclaration.type));
			const className = symbol.valueDeclaration.type.typeArguments?.[0].getText();
			assert(className);
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
		return isSomeType(type, t => t.symbol === this.getSymbolOrThrow(ROACT_SYMBOL_NAMES.Element));
	}
}
