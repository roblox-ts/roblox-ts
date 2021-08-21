import ts from "byots";
import fs from "fs-extra";
import path from "path";
import { RBXTS_SCOPE } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";

export const JSX_SYMBOL_NAMES: Record<string, string> = {
	Fragment: "Fragment",
	Element: "Element",
};
export const ROACT_SYMBOL_NAMES: Record<string, string> = {
	Component: "Component",
	PureComponent: "PureComponent",
};

export class JsxSymbolManager {
	private readonly symbols = new Map<string, ts.Symbol>();
	private readonly jsxIntrinsicNameMap = new Map<ts.Symbol, string>();

	private constructor(typeChecker: ts.TypeChecker, roactIndexSourceFile: ts.SourceFile, jsxProvider: string) {
		const roactNamespace = roactIndexSourceFile.locals?.get(
			ts.escapeLeadingUnderscores(jsxProvider),
		)?.valueDeclaration;
		assert(roactNamespace);
		const roactExports = roactNamespace.symbol.exports;
		assert(roactExports);

		for (const symbolName of Object.values(JSX_SYMBOL_NAMES)) {
			const symbol = roactExports.get(ts.escapeLeadingUnderscores(symbolName));
			assert(symbol);
			this.symbols.set(symbolName, ts.skipAlias(symbol, typeChecker));
		}

		if (jsxProvider === "Roact") {
			for (const symbolName of Object.values(ROACT_SYMBOL_NAMES)) {
				const symbol = roactExports.get(ts.escapeLeadingUnderscores(symbolName));
				assert(symbol);
				this.symbols.set(symbolName, ts.skipAlias(symbol, typeChecker));
			}
		}

		// JSX intrinsic elements
		for (const symbol of typeChecker.getJsxIntrinsicTagNamesAt(roactIndexSourceFile)) {
			assert(symbol.valueDeclaration && ts.isPropertySignature(symbol.valueDeclaration));
			assert(symbol.valueDeclaration.type && ts.isTypeReferenceNode(symbol.valueDeclaration.type));
			const className = symbol.valueDeclaration.type.typeArguments?.[0].getText();
			assert(className);
			this.jsxIntrinsicNameMap.set(symbol, className);
		}
	}

	public static create(
		data: ProjectData,
		program: ts.Program,
		typeChecker: ts.TypeChecker,
		compilerOptions: ts.CompilerOptions,
	): JsxSymbolManager | undefined {
		const jsxProvider = compilerOptions.jsxFactory?.split(".")?.[0] ?? "Roact";
		const pkgPath = path.join(data.nodeModulesPath, RBXTS_SCOPE, jsxProvider);
		const pkgJsonPath = realPathExistsSync(path.join(pkgPath, "package.json"));
		if (pkgJsonPath !== undefined) {
			const pkgJson = fs.readJsonSync(pkgJsonPath) as { typings?: string; types?: string };
			const typesPath = realPathExistsSync(path.join(pkgPath, pkgJson.types ?? pkgJson.typings ?? "index.d.ts"));
			if (typesPath !== undefined) {
				const roactIndexSourceFile = program.getSourceFile(typesPath);
				if (roactIndexSourceFile) {
					return new JsxSymbolManager(typeChecker, roactIndexSourceFile, jsxProvider);
				}
			}
		}

		// playground fallback
		const roactIndexSourceFilePath = path.join(data.nodeModulesPath, RBXTS_SCOPE, "roact", "src", "index.d.ts");
		const roactIndexSourceFile = program.getSourceFile(roactIndexSourceFilePath);
		if (roactIndexSourceFile) {
			return new JsxSymbolManager(typeChecker, roactIndexSourceFile, "Roact");
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
