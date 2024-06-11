import { IdentifierMacro, MacroList } from "TSTransformer/macros/types";

export const IDENTIFIER_MACROS: MacroList<IdentifierMacro> = {
	Promise: (state, node) => state.TS(node, "Promise"),
	Symbol: (state, node) => state.TS(node, "Symbol"),
};
