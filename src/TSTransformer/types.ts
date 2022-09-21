import { MacroManager, RoactSymbolManager } from "TSTransformer";

export interface TransformServices {
	macroManager: MacroManager;
	roactSymbolManager: RoactSymbolManager | undefined;
}

export interface TryUses {
	usesReturn: boolean;
	usesBreak: boolean;
	usesContinue: boolean;
}
