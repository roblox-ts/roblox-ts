import * as ts from "ts-morph";
import { compileExpression, compileLoopBody } from ".";
import { CompilerState } from "../CompilerState";
import { joinIndentedLines } from "../utility";

export function compileWhileStatement(state: CompilerState, node: ts.WhileStatement) {
	const exp = node.getExpression();
	state.pushIdStack();
	state.enterPrecedingStatementContext();
	const expStr = compileExpression(state, exp);
	let result = "";
	const context = state.exitPrecedingStatementContext();
	const contextHasStatements = context.length > 0;

	// Did you know `while true do` loops are optimized by the Lua interpreter?
	// It skips checking whether true is true (it's true!)

	result += state.indent + `while ${contextHasStatements ? "true" : expStr} do\n`;
	state.pushIndent();

	if (contextHasStatements) {
		result += joinIndentedLines(context, 1);
		result += state.indent + `if not (${expStr}) then break; end;\n`;
	}

	result += compileLoopBody(state, node.getStatement());
	state.popIndent();

	result += state.indent + `end;\n`;

	state.popIdStack();
	return result;
}
