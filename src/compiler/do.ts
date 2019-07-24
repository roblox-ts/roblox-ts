import * as ts from "ts-morph";
import { compileExpression, compileLoopBody } from ".";
import { CompilerState } from "../CompilerState";
import { skipNodesDownwards } from "../utility/general";
import { assertNonLuaTuple } from "./if";

export function compileDoStatement(state: CompilerState, node: ts.DoStatement) {
	state.pushIdStack();
	let result = state.indent + "repeat\n";
	state.pushIndent();
	result += state.indent + "do\n";
	state.pushIndent();
	result += compileLoopBody(state, node.getStatement());
	state.popIndent();
	result += state.indent + "end;\n";
	state.enterPrecedingStatementContext();
	const condition = compileExpression(state, skipNodesDownwards(assertNonLuaTuple(node.getExpression())));
	result += state.exitPrecedingStatementContextAndJoin();
	state.popIndent();
	result += state.indent + `until not (${condition});\n`;
	state.popIdStack();
	return result;
}
