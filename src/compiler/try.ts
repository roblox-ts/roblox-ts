import * as ts from "ts-morph";
import { compileExpression, compileStatementedNode } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards } from "../utility/general";
import { getType, isStringType } from "../utility/type";
import { checkReserved } from "./security";

export function compileThrowStatement(state: CompilerState, node: ts.ThrowStatement) {
	const expression = skipNodesDownwards(node.getExpression());
	if (!expression || !isStringType(getType(expression))) {
		throw new CompilerError("Non-string throws are not supported!", node, CompilerErrorType.NonStringThrow);
	}
	state.enterPrecedingStatementContext();
	const err = compileExpression(state, expression);
	return state.exitPrecedingStatementContextAndJoin() + state.indent + `error(${err});\n`;
}

export function compileTryStatement(state: CompilerState, node: ts.TryStatement) {
	const tryBlock = node.getTryBlock();
	const returnStatement = tryBlock
		.getDescendantStatements()
		.find(statement => ts.TypeGuards.isReturnStatement(statement));
	if (returnStatement) {
		throw new CompilerError(
			"Try blocks cannot have return statements!",
			returnStatement,
			CompilerErrorType.TryReturn,
		);
	}

	let result = "";

	let hasErrVar = false;
	const catchClause = node.getCatchClause();
	if (catchClause) {
		hasErrVar = catchClause.getVariableDeclaration() !== undefined;
	}

	const successId = catchClause ? state.getNewId() : "";
	const errMsgId = catchClause ? state.getNewId() : "";

	result += state.indent;
	if (catchClause) {
		if (hasErrVar) {
			result += `local ${successId}, ${errMsgId}`;
		} else {
			result += `local ${successId}`;
		}
		result += ` = `;
	}
	result += `pcall(function()\n`;

	state.pushIndent();
	result += compileStatementedNode(state, tryBlock);
	state.popIndent();
	result += state.indent + `end);\n`;

	if (catchClause) {
		result += state.indent + `if not ${successId} then\n`;
		state.pushIndent();
		if (hasErrVar) {
			const variableDeclaration = catchClause.getVariableDeclarationOrThrow().getNameNode();
			const varName = checkReserved(variableDeclaration);
			result += state.indent + `local ${varName} = ${errMsgId};\n`;
		}
		result += compileStatementedNode(state, catchClause.getBlock());
		state.popIndent();
		result += state.indent + `end;\n`;
	}

	const finallyBlock = node.getFinallyBlock();
	if (finallyBlock) {
		result += state.indent + `do\n`;
		state.pushIndent();
		result += compileStatementedNode(state, finallyBlock);
		state.popIndent();
		result += state.indent + `end;\n`;
	}

	return result;
}
