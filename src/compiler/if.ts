import * as ts from "ts-morph";
import { transpileExpression, transpileStatement } from ".";
import { CompilerState } from "../CompilerState";

export function transpileIfStatement(state: CompilerState, node: ts.IfStatement) {
	let result = "";
	const expStr = transpileExpression(state, node.getExpression());
	result += state.indent + `if ${expStr} then\n`;
	state.pushIndent();
	result += transpileStatement(state, node.getThenStatement());
	state.popIndent();
	let elseStatement = node.getElseStatement();
	while (elseStatement && ts.TypeGuards.isIfStatement(elseStatement)) {
		const elseIfExpression = transpileExpression(state, elseStatement.getExpression());
		result += state.indent + `elseif ${elseIfExpression} then\n`;
		state.pushIndent();
		result += transpileStatement(state, elseStatement.getThenStatement());
		state.popIndent();
		elseStatement = elseStatement.getElseStatement();
	}
	if (elseStatement) {
		result += state.indent + "else\n";
		state.pushIndent();
		result += transpileStatement(state, elseStatement);
		state.popIndent();
	}
	result += state.indent + `end;\n`;
	return result;
}
