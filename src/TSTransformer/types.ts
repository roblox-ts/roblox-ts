import { GlobalSymbols, JsxSymbolManager, MacroManager } from "TSTransformer";

export interface TransformServices {
	globalSymbols: GlobalSymbols;
	macroManager: MacroManager;
	roactSymbolManager: JsxSymbolManager | undefined;
}

export interface TryUses {
	usesReturn: boolean;
	usesBreak: boolean;
	usesContinue: boolean;
}
