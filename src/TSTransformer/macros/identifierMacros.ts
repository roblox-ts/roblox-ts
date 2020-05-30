import * as lua from "LuaAST";
import { IdentifierMacro, MacroList } from "TSTransformer/macros/types";
import { v4 as uuidv4 } from "uuid";

export const IDENTIFIER_MACROS: MacroList<IdentifierMacro> = {
	PKG_VERSION: state => lua.string(state.compileState.pkgVersion ?? "0.0.0"),
	// UNIQUE_GUID: () => lua.string(uuidv4()),
	Promise: state => state.TS("Promise"),
};
