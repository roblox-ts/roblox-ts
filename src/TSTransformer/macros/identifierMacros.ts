import luau from "LuauAST";
import { IdentifierMacro, MacroList } from "TSTransformer/macros/types";

export const IDENTIFIER_MACROS: MacroList<IdentifierMacro> = {
	PKG_VERSION: state => luau.string(state.pkgVersion ?? "0.0.0"),
	GIT_COMMIT: state => luau.string(state.gitCommit ?? "No git repository"),
	Promise: state => state.TS("Promise"),
};
