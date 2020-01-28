import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderVarArgsLiteral(state: RenderState, node: lua.VarArgsLiteral) {
	return "...";
}
