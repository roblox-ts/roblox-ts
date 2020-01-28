import * as lua from "../../../LuaAST";
import { RenderState } from "../../RenderState";
import { renderParameters } from "../../util/parameters";
import { renderStatements } from "../../util/statements";

export function renderFunctionExpression(state: RenderState, node: lua.FunctionExpression) {
	let result = "";

	result += `function(${renderParameters(state, node)})\n`;
	state.pushIndent();
	result += renderStatements(state, node.statements);
	state.popIndent();
	result += state.indent + `end`;

	return result;
}
