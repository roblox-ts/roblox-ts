import { render } from "../..";
import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";
import { renderStatements } from "../../util/statements";

export function renderRepeatStatement(state: RenderState, node: lua.RepeatStatement) {
	let result = "";
	result += state.indent + `repeat\n`;
	state.pushIndent();
	result += renderStatements(state, node.statements);
	state.popIndent();
	result += state.indent + `until ${render(state, node.condition)}\n`;
	return result;
}
