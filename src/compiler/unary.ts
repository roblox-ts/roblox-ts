import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { getWritableOperandName, isIdentifierDefinedInExportLet } from "./indexed";

function isUnaryExpressionNonStatement(
	parent: ts.Node<ts.ts.Node>,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	return !(
		ts.TypeGuards.isExpressionStatement(parent) ||
		(ts.TypeGuards.isForStatement(parent) && parent.getCondition() !== node)
	);
}

function getIncrementString(
	opKind: ts.ts.PrefixUnaryOperator,
	expStr: string,
	node: ts.Node,
	varName: string = expStr,
) {
	if (opKind === ts.SyntaxKind.PlusPlusToken) {
		return `${varName} = ${expStr} + 1`;
	} else if (opKind === ts.SyntaxKind.MinusMinusToken) {
		return `${varName} = ${expStr} - 1`;
	} else {
		/* istanbul ignore next */
		throw new CompilerError(`Bad unary expression! (${opKind})`, node, CompilerErrorType.BadPrefixUnaryExpression);
	}
}

export function compilePrefixUnaryExpression(state: CompilerState, node: ts.PrefixUnaryExpression) {
	const operand = node.getOperand();
	const opKind = node.getOperatorToken();
	if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
		const parent = node.getParentOrThrow();
		const isNonStatement = isUnaryExpressionNonStatement(parent, node);
		const expStr = getWritableOperandName(state, operand);

		if (isNonStatement) {
			if (!ts.TypeGuards.isIdentifier(operand) || isIdentifierDefinedInExportLet(state, operand)) {
				const id = state.getNewId();
				const incrStr = getIncrementString(opKind, expStr, node, `local ${id}`);
				state.pushPrecedingStatements(node, state.indent + incrStr + ";\n");
				state.pushPrecedingStatements(node, state.indent + `${expStr} = ${id};\n`);
				state.getCurrentPrecedingStatementContext(node).isPushed = true;
				return id;
			} else {
				const incrStr = getIncrementString(opKind, expStr, node);
				state.pushPrecedingStatements(node, state.indent + incrStr + ";\n");
				return expStr;
			}
		} else {
			return getIncrementString(opKind, expStr, node);
		}
	} else {
		const expStr = compileExpression(state, operand);
		const tokenKind = node.getOperatorToken();
		if (tokenKind === ts.SyntaxKind.ExclamationToken) {
			return `not ${expStr}`;
		} else if (tokenKind === ts.SyntaxKind.MinusToken) {
			return `-${expStr}`;
		} else if (tokenKind === ts.SyntaxKind.TildeToken) {
			state.usesTSLibrary = true;
			return `TS.bit_not(${expStr})`;
		} else {
			/* istanbul ignore next */
			throw new CompilerError(
				`Bad prefix unary expression! (${tokenKind})`,
				node,
				CompilerErrorType.BadPrefixUnaryExpression,
			);
		}
	}
}

export function compilePostfixUnaryExpression(state: CompilerState, node: ts.PostfixUnaryExpression) {
	const operand = node.getOperand();
	const opKind = node.getOperatorToken();
	if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
		const parent = node.getParentOrThrow();
		const isNonStatement = isUnaryExpressionNonStatement(parent, node);
		const expStr = getWritableOperandName(state, operand);

		if (isNonStatement) {
			const id = state.pushPrecedingStatementToNextId(node, expStr);
			const incrStr = getIncrementString(opKind, id, node, expStr);
			state.pushPrecedingStatements(node, state.indent + incrStr + ";\n");
			state.getCurrentPrecedingStatementContext(node).isPushed = true;
			return id;
		} else {
			return getIncrementString(opKind, expStr, node);
		}
	} else {
		/* istanbul ignore next */
		throw new CompilerError(
			`Bad postfix unary expression! (${opKind})`,
			node,
			CompilerErrorType.BadPostfixUnaryExpression,
		);
	}
}
