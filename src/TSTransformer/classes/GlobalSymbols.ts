import ts from "byots";
import { assert } from "Shared/util/assert";

export class GlobalSymbols {
	private getSymbolOrThrow(symbolName: string) {
		const symbol = this.typeChecker.resolveName(symbolName, undefined, ts.SymbolFlags.Value, false);
		assert(symbol);
		return symbol;
	}

	public readonly globalThis = this.getSymbolOrThrow("globalThis");

	constructor(private readonly typeChecker: ts.TypeChecker) {}
}
