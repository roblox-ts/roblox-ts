import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";
import { renderStatements } from "../../util/statements";

export function renderDoStatement(state: RenderState, node: lua.DoStatement) {
	let result = "";
	result += "do\n";
	state.pushIndent();
	result += renderStatements(state, node.statements);
	state.popIndent();
	result += "end\n";
	return result;
}
