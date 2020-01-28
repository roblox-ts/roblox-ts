import { render } from "../..";
import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";
import { renderStatements } from "../../util/statements";

export function renderWhileStatement(state: RenderState, node: lua.WhileStatement) {
	let result = "";
	result += state.indent + `while ${render(state, node.condition)} do\n`;
	state.pushIndent();
	result += renderStatements(state, node.statements);
	state.popIndent();
	result += state.indent + `end\n`;
	return result;
}
