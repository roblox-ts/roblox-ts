import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderTrueLiteral(state: RenderState, node: lua.TrueLiteral) {
	return "true";
}
