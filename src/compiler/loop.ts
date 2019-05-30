import * as ts from "ts-morph";
import { compileStatement } from ".";
import { CompilerState } from "../CompilerState";

function hasContinueDescendant(node: ts.Node) {
	for (const child of node.getChildren()) {
		if (ts.TypeGuards.isContinueStatement(child)) {
			return true;
		}
		if (
			!(
				ts.TypeGuards.isForInStatement(child) ||
				ts.TypeGuards.isForOfStatement(child) ||
				ts.TypeGuards.isForStatement(child) ||
				ts.TypeGuards.isWhileStatement(child) ||
				ts.TypeGuards.isDoStatement(child)
			)
		) {
			if (hasContinueDescendant(child)) {
				return true;
			}
		}
	}
	return false;
}

export function compileLoopBody(state: CompilerState, node: ts.Statement) {
	const hasContinue = hasContinueDescendant(node);

	let endsWithBreakOrReturn = false;
	if (ts.TypeGuards.isBlock(node)) {
		const statements = node.getStatements();
		const lastStatement = statements[statements.length - 1];
		if (lastStatement) {
			if (ts.TypeGuards.isBreakStatement(lastStatement) || ts.TypeGuards.isReturnStatement(lastStatement)) {
				endsWithBreakOrReturn = true;
			}
		}
	}

	let result = "";
	if (hasContinue) {
		state.continueId++;
		result += state.indent + `local _continue_${state.continueId} = false;\n`;
		result += state.indent + `repeat\n`;
		state.pushIndent();
	}

	result += compileStatement(state, node);

	if (hasContinue) {
		if (!endsWithBreakOrReturn) {
			result += state.indent + `_continue_${state.continueId} = true;\n`;
		}
		state.popIndent();
		result += state.indent + `until true;\n`;
		result += state.indent + `if not _continue_${state.continueId} then\n`;
		state.pushIndent();
		result += state.indent + `break;\n`;
		state.popIndent();
		result += state.indent + `end;\n`;
		state.continueId--;
	}

	return result;
}
