import { MacroManager } from "TSTransformer";

export interface TransformServices {
	macroManager: MacroManager;
}

export interface TryUses {
	usesReturn: boolean;
	usesBreak: boolean;
	usesContinue: boolean;
}
