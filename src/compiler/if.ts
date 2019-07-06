import * as ts from "ts-morph";
import { compileStatement, compileTruthyCheck } from ".";
import { CompilerState } from "../CompilerState";
import { joinIndentedLines, skipNodesDownwards } from "../utility";

export function compileIfStatement(state: CompilerState, node: ts.IfStatement) {
	state.enterPrecedingStatementContext();
	const expStr = compileTruthyCheck(state, skipNodesDownwards(node.getExpression()));
	const lines = state.exitPrecedingStatementContext();
	lines.push(state.indent + `if ${expStr} then\n`);
	state.pushIndent();
	lines.push(compileStatement(state, node.getThenStatement()));
	state.popIndent();
	let elseStatement = node.getElseStatement();
	let numBlocks = 1;

	while (elseStatement && ts.TypeGuards.isIfStatement(elseStatement)) {
		state.enterPrecedingStatementContext();
		state.pushIndent();
		const elseIfExpression = compileTruthyCheck(state, skipNodesDownwards(elseStatement.getExpression()));
		const context = state.exitPrecedingStatementContext();

		if (context.length > 0) {
			state.popIndent();
			lines.push(state.indent + `else\n`);
			state.pushIndent();
			numBlocks++;
			lines.push(joinIndentedLines(context));
			lines.push(state.indent + `if ${elseIfExpression} then\n`);
		} else {
			state.popIndent();
			lines.push(state.indent + `elseif ${elseIfExpression} then\n`);
		}

		state.pushIndent();
		lines.push(compileStatement(state, elseStatement.getThenStatement()));
		state.popIndent();
		elseStatement = elseStatement.getElseStatement();
	}

	if (elseStatement) {
		lines.push(state.indent + "else\n");
		state.pushIndent();
		lines.push(compileStatement(state, elseStatement));
		state.popIndent();
	}

	lines.push(state.indent + `end;\n`);

	for (let i = 1; i < numBlocks; i++) {
		state.popIndent();
		lines.push(state.indent + `end;\n`);
	}

	return lines.join("");
}
