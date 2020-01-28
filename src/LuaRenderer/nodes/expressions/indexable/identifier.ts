import * as lua from "../../../../LuaAST";
import { RenderState } from "../../../RenderState";

export function renderIdentifier(state: RenderState, node: lua.Identifier) {
	return node.name;
}
