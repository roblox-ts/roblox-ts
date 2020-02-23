import ts from "typescript";
import * as lua from "LuaAST";
import { Macro } from "TSTransformer/macros/types";

type IdentifierMacro = Macro<ts.Identifier, lua.Expression>;

export const IDENTIFIER_MACROS = new Map<string, IdentifierMacro>([
	["PKG_VERSION", state => lua.string(state.projectVersion)],
]);
