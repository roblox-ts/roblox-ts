import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards } from "../utility/general";
import { getType, isStringType } from "../utility/type";

export function compileThrowStatement(state: CompilerState, node: ts.ThrowStatement) {
	const expression = skipNodesDownwards(node.getExpression());
	if (!expression || !isStringType(getType(expression))) {
		throw new CompilerError("Non-string throws are not supported!", node, CompilerErrorType.NonStringThrow);
	}
	state.enterPrecedingStatementContext();
	const err = compileExpression(state, expression);
	return state.exitPrecedingStatementContextAndJoin() + state.indent + `error(${err});\n`;
}
