import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";

export function compileYieldExpression(state: CompilerState, node: ts.YieldExpression) {
	if (!ts.TypeGuards.isExpressionStatement(node.getParent())) {
		throw new CompilerError(
			"Yield expressions must be expression statements!",
			node,
			CompilerErrorType.YieldNotInExpressionStatement,
		);
	}

	const exp = node.getExpression();
	if (node.isGenerator()) {
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
		let result = `coroutine.yield({\n`;
		state.pushIndent();
		result += state.indent + `value = ${exp ? compileExpression(state, exp) : "nil"};\n`;
		result += state.indent + `done = false;\n`;
		state.popIndent();
		result += state.indent + `})`;
		return result;
	}
}
