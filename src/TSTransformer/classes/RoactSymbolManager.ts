import ts from "byots";
import path from "path";
import { assert } from "Shared/util/assert";

export const ROACT_SYMBOL_NAMES = {
	Component: "Component",
	PureComponent: "PureComponent",
	Fragment: "Fragment",
	Ref: "Ref",
	Event: "Event",
	Change: "Change",
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
	private readonly symbols = new Map<string, ts.Symbol>();
	private readonly intrinsicElementMap = new Map<ts.Symbol, string>();
	private readonly keySymbol: ts.Symbol | undefined;

	private addSymbolFromNode(name: string, node: ts.Node) {
		const symbol = this.typeChecker.getSymbolAtLocation(node);
		assert(symbol);
		assert(!this.symbols.has(name));
		this.symbols.set(name, symbol);
	}

	constructor(program: ts.Program, typeChecker: ts.TypeChecker, nodeModulesPath: string) {
		this.typeChecker = typeChecker;

		// only continue if @rbxts/roact exists
		const roactIndexPath = path.join(nodeModulesPath, "roact", "index.d.ts");
		const roactInternalPath = path.join(nodeModulesPath, "roact", "internal.d.ts");

		const roactIndexSourceFile = program.getSourceFile(roactIndexPath);
		const roactInternalSourceFile = program.getSourceFile(roactInternalPath);
		if (!roactIndexSourceFile && !roactInternalSourceFile) return;
		assert(roactIndexSourceFile && roactInternalSourceFile);

		const roactNamespace = getChildByNameOrThrow(roactIndexSourceFile.statements, "Roact");
		assert(ts.isModuleDeclaration(roactNamespace) && roactNamespace.body && ts.isModuleBlock(roactNamespace.body));

		const roactSymbolNameSet = new Set(Object.values(ROACT_SYMBOL_NAMES));
		for (const statement of roactNamespace.body.statements) {
			if (ts.isClassDeclaration(statement) && statement.name) {
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

		const global = getChildByNameOrThrow(roactIndexSourceFile.statements, "global");
		assert(ts.isModuleDeclaration(global) && global.body && ts.isModuleBlock(global.body));

		const jsxNamespace = getChildByNameOrThrow(global.body.statements, "JSX");
		assert(ts.isModuleDeclaration(jsxNamespace) && jsxNamespace.body && ts.isModuleBlock(jsxNamespace.body));

		const intrinsicElements = getChildByNameOrThrow(jsxNamespace.body.statements, "IntrinsicElements");
		assert(ts.isInterfaceDeclaration(intrinsicElements));

		for (const intrinsicElement of intrinsicElements.members) {
			assert(
				ts.isPropertySignature(intrinsicElement) &&
					intrinsicElement.name &&
					ts.isIdentifier(intrinsicElement.name) &&
					intrinsicElement.type &&
					ts.isTypeReferenceNode(intrinsicElement.type),
			);
			const symbol = this.typeChecker.getSymbolAtLocation(intrinsicElement.name);
			assert(symbol);
			const className = intrinsicElement.type.typeArguments?.[0].getText();
			assert(className);
			this.intrinsicElementMap.set(symbol, className);
		}

		const rbxJsxProps = getChildByNameOrThrow(roactInternalSourceFile.statements, "RbxJsxProps");
		assert(ts.isInterfaceDeclaration(rbxJsxProps));

		const key = getChildByNameOrThrow(rbxJsxProps.members, "Key");
		assert(ts.isPropertySignature(key) && ts.isIdentifier(key.name));

		const keySymbol = this.typeChecker.getSymbolAtLocation(key.name);
		assert(keySymbol);

		this.keySymbol = keySymbol;
	}

	public getSymbolOrThrow(symbolName: string): ts.Symbol {
		const symbol = this.symbols.get(symbolName);
		assert(symbol, `Could not find symbol for ${symbolName}`);
		return symbol;
	}

	public getIntrinsicElementClassNameFromSymbol(symbol: ts.Symbol) {
		return this.intrinsicElementMap.get(symbol);
	}

	public getKeySymbolOrThrow() {
		assert(this.keySymbol);
		return this.keySymbol;
	}
}
