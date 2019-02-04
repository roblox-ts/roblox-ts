import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../class/errors/TranspilerError";
import { TranspilerState } from "../class/TranspilerState";

function useIIFEforUnaryExpression(
	parent: ts.Node<ts.ts.Node>,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	return !(
		ts.TypeGuards.isExpressionStatement(parent) ||
		(ts.TypeGuards.isForStatement(parent) && parent.getCondition() !== node)
	);
}

export function transpilePrefixUnaryExpression(state: TranspilerState, node: ts.PrefixUnaryExpression) {
	const parent = node.getParentOrThrow();
	const operand = node.getOperand();

	let expStr: string;
	const statements = new Array<string>();

	const opKind = node.getOperatorToken();
	state.pushIdStack();
	if (
		(opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) &&
		ts.TypeGuards.isPropertyAccessExpression(operand)
	) {
		const expression = operand.getExpression();
		const opExpStr = transpileExpression(state, expression);
		const propertyStr = operand.getName();
		const id = state.getNewId();
		statements.push(`local ${id} = ${opExpStr}`);
		expStr = `${id}.${propertyStr}`;
	} else {
		expStr = transpileExpression(state, operand);
	}

	function getOperandStr() {
		switch (opKind) {
			case ts.SyntaxKind.PlusPlusToken:
				return `${expStr} = ${expStr} + 1`;
			case ts.SyntaxKind.MinusMinusToken:
				return `${expStr} = ${expStr} - 1`;
		}
		throw new TranspilerError("Unrecognized operation! #2", node, TranspilerErrorType.UnrecognizedOperation2);
	}

	if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
		statements.push(getOperandStr());
		if (useIIFEforUnaryExpression(parent, node)) {
			state.popIdStack();
			const statementsStr = statements.join("; ");
			return `(function() ${statementsStr}; return ${expStr}; end)()`;
		} else {
			return statements.join("; ");
		}
	}

	const tokenKind = node.getOperatorToken();
	switch (tokenKind) {
		case ts.SyntaxKind.ExclamationToken:
			return `not ${expStr}`;
		case ts.SyntaxKind.MinusToken:
			return `-${expStr}`;
	}
	throw new TranspilerError(
		`Bad prefix unary expression! (${tokenKind})`,
		node,
		TranspilerErrorType.BadPrefixUnaryExpression,
	);
}

export function transpilePostfixUnaryExpression(state: TranspilerState, node: ts.PostfixUnaryExpression) {
	const parent = node.getParentOrThrow();
	const operand = node.getOperand();

	let expStr: string;
	const statements = new Array<string>();

	const opKind = node.getOperatorToken();
	state.pushIdStack();
	if (
		(opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) &&
		ts.TypeGuards.isPropertyAccessExpression(operand)
	) {
		const expression = operand.getExpression();
		const opExpStr = transpileExpression(state, expression);
		const propertyStr = operand.getName();
		const id = state.getNewId();
		statements.push(`local ${id} = ${opExpStr}`);
		expStr = `${id}.${propertyStr}`;
	} else {
		expStr = transpileExpression(state, operand);
	}

	function getOperandStr() {
		switch (opKind) {
			case ts.SyntaxKind.PlusPlusToken:
				return `${expStr} = ${expStr} + 1`;
			case ts.SyntaxKind.MinusMinusToken:
				return `${expStr} = ${expStr} - 1`;
		}
		throw new TranspilerError("Unrecognized operation! #3", node, TranspilerErrorType.UnrecognizedOperation3);
	}

	if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
		if (useIIFEforUnaryExpression(parent, node)) {
			const id = state.getNewId();
			state.popIdStack();
			statements.push(`local ${id} = ${expStr}`);
			statements.push(getOperandStr());
			const statementsStr = statements.join("; ");
			return `(function() ${statementsStr}; return ${id}; end)()`;
		} else {
			statements.push(getOperandStr());
			return statements.join("; ");
		}
	}
	throw new TranspilerError(
		`Bad postfix unary expression! (${opKind})`,
		node,
		TranspilerErrorType.BadPostfixUnaryExpression,
	);
}
