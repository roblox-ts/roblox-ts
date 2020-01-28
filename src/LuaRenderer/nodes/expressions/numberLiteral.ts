import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderNumberLiteral(state: RenderState, node: lua.NumberLiteral) {
	return `${node.value}`;
}
