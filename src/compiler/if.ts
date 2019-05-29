import ts from "ts-morph";
import { compileExpression, compileStatement } from ".";
import { CompilerState } from "../CompilerState";
import { joinIndentedLines } from "../utility";

export function compileIfStatement(state: CompilerState, node: ts.IfStatement) {
	let result = "";
	state.enterPrecedingStatementContext();
	const expStr = compileExpression(state, node.getExpression());
	result += state.exitPrecedingStatementContextAndJoin();
	result += state.indent + `if ${expStr} then\n`;
	state.pushIndent();
	result += compileStatement(state, node.getThenStatement());
	state.popIndent();
	let elseStatement = node.getElseStatement();
	let numBlocks = 1;

	while (elseStatement && ts.TypeGuards.isIfStatement(elseStatement)) {
		state.enterPrecedingStatementContext();
		state.pushIndent();
		const exp = elseStatement.getExpression();
		const elseIfExpression = compileExpression(state, exp);
		const context = state.exitPrecedingStatementContext();

		if (context.length > 0) {
			state.popIndent();
			result += state.indent + `else\n`;
			state.pushIndent();
			numBlocks++;
			result += joinIndentedLines(context);
			result += state.indent + `if ${elseIfExpression} then\n`;
		} else {
			state.popIndent();

			result += state.indent + `elseif ${elseIfExpression} then\n`;
		}

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

	for (let i = 1; i < numBlocks; i++) {
		state.popIndent();
		result += state.indent + `end;\n`;
	}
	return result;
}
