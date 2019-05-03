import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";

function isUnaryExpressionNonStatement(
	parent: ts.Node<ts.ts.Node>,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	return !(
		ts.TypeGuards.isExpressionStatement(parent) ||
		(ts.TypeGuards.isForStatement(parent) && parent.getCondition() !== node)
	);
}

function getUnaryExpressionString(state: CompilerState, operand: ts.UnaryExpression) {
	if (ts.TypeGuards.isPropertyAccessExpression(operand)) {
		const expression = operand.getExpression();
		const opExpStr = compileExpression(state, expression);
		const propertyStr = operand.getName();
		const id = state.pushPrecedingStatementToNextId(operand, opExpStr);
		return `${id}.${propertyStr}`;
	} else {
		return compileExpression(state, operand);
	}
}

function getIncrementString(opKind: ts.ts.PrefixUnaryOperator, expStr: string, node: ts.Node) {
	if (opKind === ts.SyntaxKind.PlusPlusToken) {
		return `${expStr} = ${expStr} + 1`;
	} else if (opKind === ts.SyntaxKind.MinusMinusToken) {
		return `${expStr} = ${expStr} - 1`;
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
		state.enterPrecedingStatementContext();
		const expStr = getUnaryExpressionString(state, operand);
		const incrStr = getIncrementString(opKind, expStr, node);

		if (isNonStatement) {
			state.pushPrecedingStatements(node, state.indent + incrStr + ";\n");
			state.pushPrecedingStatements(node, ...state.exitPrecedingStatementContext());
			return expStr;
		} else {
			state.pushPrecedingStatements(node, incrStr);
			return state.exitPrecedingStatementContextAndJoin();
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
		state.enterPrecedingStatementContext();
		const expStr = getUnaryExpressionString(state, operand);
		const incrStr = getIncrementString(opKind, expStr, node);

		if (isNonStatement) {
			const id = state.pushPrecedingStatementToNextId(node, expStr);
			state.pushPrecedingStatements(node, state.indent + incrStr + ";\n");
			state.pushPrecedingStatements(node, ...state.exitPrecedingStatementContext());
			state.setCurrentContextAsPushed(node);
			return id;
		} else {
			state.pushPrecedingStatements(node, incrStr);
			return state.exitPrecedingStatementContextAndJoin();
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
