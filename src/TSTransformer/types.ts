import { MacroManager } from "TSTransformer";
import { JSXSymbolManager } from "TSTransformer/classes/JSXSymbolManager";

export interface TransformServices {
	macroManager: MacroManager;
	jsxSymbolManager: JSXSymbolManager;
}

export interface TryUses {
	usesReturn: boolean;
	usesBreak: boolean;
	usesContinue: boolean;
}
