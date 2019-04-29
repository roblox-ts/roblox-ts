import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";

function useIIFEforUnaryExpression(
	parent: ts.Node<ts.ts.Node>,
	node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	return !(
		ts.TypeGuards.isExpressionStatement(parent) ||
		(ts.TypeGuards.isForStatement(parent) && parent.getCondition() !== node)
	);
}

export function compilePrefixUnaryExpression(state: CompilerState, node: ts.PrefixUnaryExpression) {
	const operand = node.getOperand();
	const opKind = node.getOperatorToken();
	if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
		const parent = node.getParentOrThrow();
		const useIIFE = useIIFEforUnaryExpression(parent, node);
		const statements = new Array<string>();
		if (useIIFE) {
			state.pushIdStack();
		}
		let expStr: string;
		if (ts.TypeGuards.isPropertyAccessExpression(operand)) {
			const expression = operand.getExpression();
			const opExpStr = compileExpression(state, expression);
			const propertyStr = operand.getName();
			const id = state.getNewId();
			statements.push(`local ${id} = ${opExpStr}`);
			expStr = `${id}.${propertyStr}`;
		} else {
			expStr = compileExpression(state, operand);
		}
		if (opKind === ts.SyntaxKind.PlusPlusToken) {
			statements.push(`${expStr} = ${expStr} + 1`);
		} else if (opKind === ts.SyntaxKind.MinusMinusToken) {
			statements.push(`${expStr} = ${expStr} - 1`);
		}
		if (useIIFE) {
			state.popIdStack();
			const statementsStr = statements.join("; ");
			return `(function() ${statementsStr}; return ${expStr}; end)()`;
		} else {
			return statements.join("; ");
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
		const useIIFE = useIIFEforUnaryExpression(parent, node);
		const statements = new Array<string>();
		if (useIIFE) {
			state.pushIdStack();
		}
		let expStr: string;
		if (ts.TypeGuards.isPropertyAccessExpression(operand)) {
			const expression = operand.getExpression();
			const opExpStr = compileExpression(state, expression);
			const propertyStr = operand.getName();
			const id = state.getNewId();
			statements.push(`local ${id} = ${opExpStr}`);
			expStr = `${id}.${propertyStr}`;
		} else {
			expStr = compileExpression(state, operand);
		}

		function getAssignmentExpression() {
			if (opKind === ts.SyntaxKind.PlusPlusToken) {
				statements.push(`${expStr} = ${expStr} + 1`);
			} else {
				statements.push(`${expStr} = ${expStr} - 1`);
			}
		}

		if (useIIFE) {
			const id = state.getNewId();
			state.popIdStack();
			statements.push(`local ${id} = ${expStr}`);
			getAssignmentExpression();
			const statementsStr = statements.join("; ");
			return `(function() ${statementsStr}; return ${id}; end)()`;
		} else {
			getAssignmentExpression();
			return statements.join("; ");
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
