import { GlobalSymbols, MacroManager, RoactSymbolManager } from "TSTransformer";

export interface TransformServices {
	globalSymbols: GlobalSymbols;
	macroManager: MacroManager;
	roactSymbolManager: RoactSymbolManager | undefined;
}

export interface TryUses {
	usesReturn: boolean;
	usesBreak: boolean;
	usesContinue: boolean;
}
