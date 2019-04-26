import * as ts from "ts-morph";
import { compileExpression, compileStatement } from ".";
import { CompilerState } from "../CompilerState";

export function compileIfStatement(state: CompilerState, node: ts.IfStatement) {
	let result = "";
	const expStr = compileExpression(state, node.getExpression());
	result += state.indent + `if ${expStr} then\n`;
	state.pushIndent();
	result += compileStatement(state, node.getThenStatement());
	state.popIndent();
	let elseStatement = node.getElseStatement();
	while (elseStatement && ts.TypeGuards.isIfStatement(elseStatement)) {
		const elseIfExpression = compileExpression(state, elseStatement.getExpression());
		result += state.indent + `elseif ${elseIfExpression} then\n`;
		state.pushIndent();
		result += compileStatement(state, elseStatement.getThenStatement());
		state.popIndent();
		elseStatement = elseStatement.getElseStatement();
	}
	if (elseStatement) {
		result += state.indent + "else\n";
		state.pushIndent();
		result += compileStatement(state, elseStatement);
		state.popIndent();
	}
	result += state.indent + `end;\n`;
	return result;
}
