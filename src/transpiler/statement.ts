import * as ts from "ts-morph";
import {
	transpileBlock,
	transpileBreakStatement,
	transpileClassDeclaration,
	transpileContinueStatement,
	transpileDoStatement,
	transpileEnumDeclaration,
	transpileExportAssignment,
	transpileExportDeclaration,
	transpileExpressionStatement,
	transpileForInStatement,
	transpileForOfStatement,
	transpileForStatement,
	transpileFunctionDeclaration,
	transpileIfStatement,
	transpileImportDeclaration,
	transpileImportEqualsDeclaration,
	transpileNamespaceDeclaration,
	transpileReturnStatement,
	transpileSwitchStatement,
	transpileThrowStatement,
	transpileTryStatement,
	transpileVariableStatement,
	transpileWhileStatement,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isTypeStatement } from "../typeUtilities";

export function transpileStatement(state: TranspilerState, node: ts.Statement): string {
	/* istanbul ignore else  */
	if (isTypeStatement(node)) {
		return "";
	} else if (ts.TypeGuards.isBlock(node)) {
		return transpileBlock(state, node);
	} else if (ts.TypeGuards.isImportDeclaration(node)) {
		return transpileImportDeclaration(state, node);
	} else if (ts.TypeGuards.isImportEqualsDeclaration(node)) {
		return transpileImportEqualsDeclaration(state, node);
	} else if (ts.TypeGuards.isExportDeclaration(node)) {
		return transpileExportDeclaration(state, node);
	} else if (ts.TypeGuards.isFunctionDeclaration(node)) {
		return transpileFunctionDeclaration(state, node);
	} else if (ts.TypeGuards.isClassDeclaration(node)) {
		return transpileClassDeclaration(state, node);
	} else if (ts.TypeGuards.isNamespaceDeclaration(node)) {
		return transpileNamespaceDeclaration(state, node);
	} else if (ts.TypeGuards.isDoStatement(node)) {
		return transpileDoStatement(state, node);
	} else if (ts.TypeGuards.isIfStatement(node)) {
		return transpileIfStatement(state, node);
	} else if (ts.TypeGuards.isBreakStatement(node)) {
		return transpileBreakStatement(state, node);
	} else if (ts.TypeGuards.isExpressionStatement(node)) {
		return transpileExpressionStatement(state, node);
	} else if (ts.TypeGuards.isContinueStatement(node)) {
		return transpileContinueStatement(state, node);
	} else if (ts.TypeGuards.isForInStatement(node)) {
		return transpileForInStatement(state, node);
	} else if (ts.TypeGuards.isForOfStatement(node)) {
		return transpileForOfStatement(state, node);
	} else if (ts.TypeGuards.isForStatement(node)) {
		return transpileForStatement(state, node);
	} else if (ts.TypeGuards.isReturnStatement(node)) {
		return transpileReturnStatement(state, node);
	} else if (ts.TypeGuards.isThrowStatement(node)) {
		return transpileThrowStatement(state, node);
	} else if (ts.TypeGuards.isVariableStatement(node)) {
		return transpileVariableStatement(state, node);
	} else if (ts.TypeGuards.isWhileStatement(node)) {
		return transpileWhileStatement(state, node);
	} else if (ts.TypeGuards.isEnumDeclaration(node)) {
		return transpileEnumDeclaration(state, node);
	} else if (ts.TypeGuards.isExportAssignment(node)) {
		return transpileExportAssignment(state, node);
	} else if (ts.TypeGuards.isSwitchStatement(node)) {
		return transpileSwitchStatement(state, node);
	} else if (ts.TypeGuards.isTryStatement(node)) {
		return transpileTryStatement(state, node);
	} else if (ts.TypeGuards.isLabeledStatement(node)) {
		throw new TranspilerError(
			"Labeled statements are not supported!",
			node,
			TranspilerErrorType.NoLabeledStatement,
		);
	}

	/* istanbul ignore next */
	if (
		ts.TypeGuards.isEmptyStatement(node) ||
		ts.TypeGuards.isTypeAliasDeclaration(node) ||
		ts.TypeGuards.isInterfaceDeclaration(node)
	) {
		return "";
	}

	/* istanbul ignore next */
	throw new TranspilerError(`Bad statement! (${node.getKindName()})`, node, TranspilerErrorType.BadStatement);
}

export function transpileStatementedNode(state: TranspilerState, node: ts.Node & ts.StatementedNode) {
	state.pushIdStack();
	state.exportStack.push(new Set<string>());
	let result = "";
	state.hoistStack.push(new Set<string>());
	for (const child of node.getStatements()) {
		result += transpileStatement(state, child);
		if (child.getKind() === ts.SyntaxKind.ReturnStatement) {
			break;
		}
	}

	result = state.popHoistStack(result);

	const scopeExports = state.exportStack.pop();
	if (scopeExports && scopeExports.size > 0) {
		scopeExports.forEach(scopeExport => (result += state.indent + scopeExport));
	}
	state.popIdStack();
	return result;
}
