import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards, skipNodesUpwards } from "../utility/general";

export function compileYieldExpression(state: CompilerState, node: ts.YieldExpression) {
	const exp = skipNodesDownwards(node.getExpression());
	if (node.isGenerator()) {
		if (!ts.TypeGuards.isExpressionStatement(skipNodesUpwards(node.getParent()))) {
			throw new CompilerError(
				"Yield expressions must be expression statements!",
				node,
				CompilerErrorType.YieldNotInExpressionStatement,
			);
		}
		state.pushIdStack();
		const id = state.getNewId();
		let result = `for ${id} in ${compileExpression(state, exp!)}.next do\n`;
		state.pushIndent();
		result += state.indent + `if ${id}.done then break end;\n`;
		result += state.indent + `coroutine.yield(${id});\n`;
		state.popIndent();
		result += state.indent + `end`;
		state.popIdStack();
		return result;
	} else {
		return `coroutine.yield(${exp ? compileExpression(state, exp) : ""})`;
	}
}
