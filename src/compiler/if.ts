import * as ts from "ts-morph";
import { compileExpression, compileStatement } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { joinIndentedLines, skipNodesDownwards } from "../utility/general";
import { getType, isTupleType } from "../utility/type";

export function assertNonLuaTuple(exp: ts.Expression) {
	if (isTupleType(getType(exp))) {
		throw new CompilerError(
			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
			exp,
			CompilerErrorType.LuaTupleInConditional,
		);
	}
	return exp;
}

export function compileIfStatement(state: CompilerState, node: ts.IfStatement) {
	let result = "";
	state.enterPrecedingStatementContext();
	const expStr = compileExpression(state, skipNodesDownwards(assertNonLuaTuple(node.getExpression())));
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
		const exp = skipNodesDownwards(assertNonLuaTuple(elseStatement.getExpression()));
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
