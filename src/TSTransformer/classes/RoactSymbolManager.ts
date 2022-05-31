import fs from "fs-extra";
import path from "path";
import { RBXTS_SCOPE } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";
import { getOriginalSymbol } from "TSTransformer/util/getOriginalSymbol";
import { CHANGE_ATTRIBUTE_NAME, EVENT_ATTRIBUTE_NAME } from "TSTransformer/util/jsx/constants";
import ts from "typescript";

export const ROACT_SYMBOL_NAMES = {
	Component: "Component",
	PureComponent: "PureComponent",
	Fragment: "Fragment",
	Element: "Element",
};

export class RoactSymbolManager {
	private readonly symbols = new Map<string, ts.Symbol>();
	private readonly jsxIntrinsicNameMap = new Map<ts.Symbol, string>();

	private constructor(typeChecker: ts.TypeChecker, roactIndexSourceFile: ts.SourceFile) {
		const roactNamespace = roactIndexSourceFile.locals?.get(ts.escapeLeadingUnderscores("Roact"))?.valueDeclaration;
		assert(roactNamespace);
		const roactExports = roactNamespace.symbol.exports;
		assert(roactExports);

		for (const symbolName of Object.values(ROACT_SYMBOL_NAMES)) {
			const symbol = roactExports.get(ts.escapeLeadingUnderscores(symbolName));
			assert(symbol);
			this.symbols.set(symbolName, getOriginalSymbol(typeChecker, symbol));
		}

		// JSX intrinsic elements
		for (const symbol of typeChecker.getJsxIntrinsicTagNamesAt(roactIndexSourceFile)) {
			assert(symbol.valueDeclaration && ts.isPropertySignature(symbol.valueDeclaration));
			assert(symbol.valueDeclaration.type && ts.isTypeReferenceNode(symbol.valueDeclaration.type));
			const className = symbol.valueDeclaration.type.typeArguments?.[0].getText();
			assert(className);
			this.jsxIntrinsicNameMap.set(getOriginalSymbol(typeChecker, symbol), className);
		}

		const jsxInstanceType = roactExports.get(ts.escapeLeadingUnderscores("JsxInstance"));
		assert(jsxInstanceType);
		const jsxInstanceTypeDeclaration = jsxInstanceType.declarations?.[0];
		assert(jsxInstanceTypeDeclaration);
		const jsxInstanceTypeType = typeChecker.getTypeAtLocation(jsxInstanceTypeDeclaration);

		const changeSymbol = typeChecker.getPropertyOfType(jsxInstanceTypeType, CHANGE_ATTRIBUTE_NAME);
		assert(changeSymbol);
		this.symbols.set(CHANGE_ATTRIBUTE_NAME, getOriginalSymbol(typeChecker, changeSymbol));

		const eventSymbol = typeChecker.getPropertyOfType(jsxInstanceTypeType, EVENT_ATTRIBUTE_NAME);
		assert(eventSymbol);
		this.symbols.set(EVENT_ATTRIBUTE_NAME, getOriginalSymbol(typeChecker, eventSymbol));
	}

	public static create(
		data: ProjectData,
		program: ts.Program,
		typeChecker: ts.TypeChecker,
	): RoactSymbolManager | undefined {
		const pkgPath = path.join(data.nodeModulesPath, RBXTS_SCOPE, "roact");
		const pkgJsonPath = realPathExistsSync(path.join(pkgPath, "package.json"));
		if (pkgJsonPath !== undefined) {
			const pkgJson = fs.readJsonSync(pkgJsonPath) as { typings?: string; types?: string };
			const typesPath = realPathExistsSync(path.join(pkgPath, pkgJson.types ?? pkgJson.typings ?? "index.d.ts"));
			if (typesPath !== undefined) {
				const roactIndexSourceFile = program.getSourceFile(typesPath);
				if (roactIndexSourceFile) {
					return new RoactSymbolManager(typeChecker, roactIndexSourceFile);
				}
			}
		}

		// playground fallback
		const roactIndexSourceFilePath = path.join(data.nodeModulesPath, RBXTS_SCOPE, "roact", "src", "index.d.ts");
		const roactIndexSourceFile = program.getSourceFile(roactIndexSourceFilePath);
		if (roactIndexSourceFile) {
			return new RoactSymbolManager(typeChecker, roactIndexSourceFile);
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
}
