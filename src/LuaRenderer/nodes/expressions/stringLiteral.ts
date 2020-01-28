import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";

export function renderStringLiteral(render: RenderState, node: lua.StringLiteral) {
	// TODO: resolve " vs ' vs [[]]
	return `"${node.value}"`;
}
