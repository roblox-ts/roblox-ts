import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderFalseLiteral(state: RenderState, node: lua.FalseLiteral) {
	return "false";
}
