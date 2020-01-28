import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderNilLiteral(state: RenderState, node: lua.NilLiteral) {
	return "nil";
}
