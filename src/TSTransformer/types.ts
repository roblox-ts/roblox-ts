import luau from "@roblox-ts/luau-ast";
import { MacroManager } from "TSTransformer";

export interface TransformServices {
	macroManager: MacroManager;
}

export interface TryUses {
	usesReturn: boolean;
	usesBreak: boolean;
	usesContinue: boolean;
}

export interface LoopLabelStackEntry {
	id: luau.TemporaryIdentifier;
	habited: boolean;
	name: string;
};

export const enum LoopLabel {
	none = "none",
	break = "break",
	continue = "continue",
}
