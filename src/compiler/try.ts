import * as ts from "ts-morph";
import { transpileExpression, transpileStatementedNode } from ".";
import { CompilerState } from "../CompilerState";

export function transpileThrowStatement(state: CompilerState, node: ts.ThrowStatement) {
	const expStr = transpileExpression(state, node.getExpressionOrThrow());
	state.usesTSLibrary = true;
	return state.indent + `TS.throw(${expStr});\n`;
}

export function transpileTryStatement(state: CompilerState, node: ts.TryStatement) {
	let result = "";

	state.pushIdStack();

	const returnsId = state.getNewId();
	state.usesTSLibrary = true;
	result += state.indent + `local ${returnsId} = TS.try(\n`;

	state.pushIndent();

	result += state.indent + "function()\n";
	state.pushIndent();
	result += transpileStatementedNode(state, node.getTryBlock());
	state.popIndent();
	result += state.indent + "end";

	const catchClause = node.getCatchClause();
	if (catchClause !== undefined) {
		result += ",\n";
		const varName = catchClause.getVariableDeclarationOrThrow().getName();
		result += state.indent + `function(${varName})\n`;
		state.pushIndent();
		result += transpileStatementedNode(state, catchClause.getBlock());
		state.popIndent();
		result += state.indent + "end";
	}
	result += "\n";

	state.popIndent();
	result += state.indent + ");\n";
	result += state.indent + `if ${returnsId}.size > 0 then return unpack(${returnsId}); end;\n`;

	const finallyBlock = node.getFinallyBlock();
	if (finallyBlock !== undefined) {
		result += transpileStatementedNode(state, finallyBlock);
	}

	state.popIdStack();

	return result;
}
