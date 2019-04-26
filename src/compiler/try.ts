import * as ts from "ts-morph";
import { compileExpression, compileStatementedNode } from ".";
import { CompilerState } from "../CompilerState";

export function compileThrowStatement(state: CompilerState, node: ts.ThrowStatement) {
	const expStr = compileExpression(state, node.getExpressionOrThrow());
	state.usesTSLibrary = true;
	return state.indent + `TS.throw(${expStr});\n`;
}

export function compileTryStatement(state: CompilerState, node: ts.TryStatement) {
	let result = "";

	state.pushIdStack();

	const returnsId = state.getNewId();
	state.usesTSLibrary = true;
	result += state.indent + `local ${returnsId} = TS.try(\n`;

	state.pushIndent();

	result += state.indent + "function()\n";
	state.pushIndent();
	result += compileStatementedNode(state, node.getTryBlock());
	state.popIndent();
	result += state.indent + "end";

	const catchClause = node.getCatchClause();
	if (catchClause !== undefined) {
		result += ",\n";
		const varName = catchClause.getVariableDeclarationOrThrow().getName();
		result += state.indent + `function(${varName})\n`;
		state.pushIndent();
		result += compileStatementedNode(state, catchClause.getBlock());
		state.popIndent();
		result += state.indent + "end";
	}
	result += "\n";

	state.popIndent();
	result += state.indent + ");\n";
	result += state.indent + `if ${returnsId}.size > 0 then return unpack(${returnsId}); end;\n`;

	const finallyBlock = node.getFinallyBlock();
	if (finallyBlock !== undefined) {
		result += compileStatementedNode(state, finallyBlock);
	}

	state.popIdStack();

	return result;
}
