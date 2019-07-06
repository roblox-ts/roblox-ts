import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	getType,
	is0TypeLax,
	isBooleanTypeStrict,
	isBoolishTypeLax,
	isFalsyStringTypeLax,
	isNumberTypeLax,
	isTupleType,
	isUnknowableType,
} from "../typeUtilities";
import { removeBalancedParenthesisFromStringBorders, skipNodesDownwards } from "../utility";
import { shouldWrapExpression } from "./call";
import { isValidLuaIdentifier } from "./security";

type LogicalOperator =
	| ts.SyntaxKind.AmpersandAmpersandToken
	| ts.SyntaxKind.BarBarToken
	| ts.SyntaxKind.EqualsEqualsEqualsToken
	| ts.SyntaxKind.ExclamationEqualsEqualsToken
	| ts.SyntaxKind.GreaterThanToken
	| ts.SyntaxKind.LessThanEqualsToken
	| ts.SyntaxKind.LessThanToken;

const NottedLogicalOperators = {
	[ts.SyntaxKind.AmpersandAmpersandToken]: ts.SyntaxKind.BarBarToken,
	[ts.SyntaxKind.BarBarToken]: ts.SyntaxKind.AmpersandAmpersandToken,
	[ts.SyntaxKind.EqualsEqualsEqualsToken]: ts.SyntaxKind.ExclamationEqualsEqualsToken,
	[ts.SyntaxKind.ExclamationEqualsEqualsToken]: ts.SyntaxKind.EqualsEqualsEqualsToken,
	[ts.SyntaxKind.GreaterThanEqualsToken]: ts.SyntaxKind.LessThanToken,
	[ts.SyntaxKind.GreaterThanToken]: ts.SyntaxKind.LessThanEqualsToken,
	[ts.SyntaxKind.LessThanEqualsToken]: ts.SyntaxKind.GreaterThanToken,
	[ts.SyntaxKind.LessThanToken]: ts.SyntaxKind.GreaterThanEqualsToken,
};

const LogicalOperatorSymbols = {
	[ts.SyntaxKind.AmpersandAmpersandToken]: " and ",
	[ts.SyntaxKind.BarBarToken]: " or ",
	[ts.SyntaxKind.EqualsEqualsEqualsToken]: " == ",
	[ts.SyntaxKind.ExclamationEqualsEqualsToken]: " ~= ",
	[ts.SyntaxKind.GreaterThanEqualsToken]: " >= ",
	[ts.SyntaxKind.GreaterThanToken]: " > ",
	[ts.SyntaxKind.LessThanEqualsToken]: " <= ",
	[ts.SyntaxKind.LessThanToken]: " < ",
};

export function compileTruthyCheck(state: CompilerState, exp: ts.Expression, extraNots = 0): string {
	if (ts.TypeGuards.isPrefixUnaryExpression(exp) && exp.getOperatorToken() === ts.SyntaxKind.ExclamationToken) {
		return compileTruthyCheck(state, skipNodesDownwards(exp.getOperand(), true), (extraNots + 1) % 2);
	} else if (ts.TypeGuards.isParenthesizedExpression(exp)) {
		return "(" + compileTruthyCheck(state, skipNodesDownwards(exp.getExpression()), extraNots) + ")";
	} else if (ts.TypeGuards.isBinaryExpression(exp)) {
		const operator = exp.getOperatorToken().getKind();

		if (operator in NottedLogicalOperators) {
			const lhs = skipNodesDownwards(exp.getLeft(), true);
			const rhs = skipNodesDownwards(exp.getRight(), true);

			if (operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.BarBarToken) {
				return (
					compileTruthyCheck(state, lhs, extraNots) +
					LogicalOperatorSymbols[
						(extraNots ? NottedLogicalOperators[operator as LogicalOperator] : operator) as LogicalOperator
					] +
					compileTruthyCheck(state, rhs, extraNots)
				);
			} else {
				return (
					compileExpression(state, lhs) +
					LogicalOperatorSymbols[
						(extraNots ? NottedLogicalOperators[operator as LogicalOperator] : operator) as LogicalOperator
					] +
					compileExpression(state, rhs)
				);
			}
		}
	}

	const expType = getType(exp);

	if (isTupleType(expType)) {
		throw new CompilerError(
			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
			exp,
			CompilerErrorType.LuaTupleInConditional,
		);
	}

	const isUnknown = isUnknowableType(expType);

	const checkNaN = isUnknown || isNumberTypeLax(expType);
	const checkNon0 = isUnknown || checkNaN || is0TypeLax(expType);
	const checkEmptyString = isUnknown || isFalsyStringTypeLax(expType);
	const checkTruthy = isUnknown || isBoolishTypeLax(expType);

	let expStr = compileExpression(state, exp);
	let mainStr = expStr;
	if (
		!isValidLuaIdentifier(expStr) &&
		(checkNaN ? 1 : 0) + (checkNon0 ? 1 : 0) + (checkEmptyString ? 1 : 0) + (checkTruthy ? 1 : 0) > 1
	) {
		expStr = state.pushPrecedingStatementToNewId(exp, expStr);
	} else if (extraNots) {
		if (shouldWrapExpression(exp, false)) {
			mainStr = `(${mainStr})`;
		}
	}

	const checks = new Array<string>();

	if (extraNots) {
		mainStr = `not ${mainStr}`;
	} else {
		mainStr = mainStr;
	}

	if (checkNon0) {
		checks.push(extraNots ? `${expStr} == 0` : `${expStr} ~= 0`);
	}

	if (checkNaN) {
		checks.push(extraNots ? `${expStr} ~= ${expStr}` : `${expStr} == ${expStr}`);
	}

	if (checkEmptyString) {
		checks.push(`${expStr} ${extraNots ? "=" : "~"}= ""`);
	}

	if (checkTruthy || checks.length === 0) {
		checks.push(mainStr);
	}

	return extraNots ? checks.join(" or ") : checks.join(" and ");
}

function getExpStr(
	state: CompilerState,
	exp: ts.Expression,
	extraNots: number,
	isAnd?: boolean,
	node?: ts.BinaryExpression,
	currentBinaryLogicContext?: string,
) {
	while (ts.TypeGuards.isPrefixUnaryExpression(exp) && exp.getOperatorToken() === ts.SyntaxKind.ExclamationToken) {
		exp = skipNodesDownwards(exp.getOperand());
		extraNots++;
	}

	const expStr = compileExpression(state, exp);
	const expType = getType(exp);

	if (isTupleType(expType)) {
		throw new CompilerError(
			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
			exp,
			CompilerErrorType.LuaTupleInConditional,
		);
	}

	const isUnknown = isUnknowableType(expType);

	const checkNaN = isUnknown || isNumberTypeLax(expType);
	const checkNon0 = isUnknown || checkNaN || is0TypeLax(expType);
	const checkEmptyString = isUnknown || isFalsyStringTypeLax(expType);
	const checkTruthy = isUnknown || isBoolishTypeLax(expType);

	const checks = new Array<string>();
	const boolify = extraNots > 0;

	// console.log(boolify, exp.getText());
	if (extraNots === 0 && isAnd === false) {
		extraNots++;
	}

	let mainStr: string;

	if (extraNots % 2) {
		mainStr = `not ${removeBalancedParenthesisFromStringBorders(expStr)}`;
	} else {
		if (boolify && !isBooleanTypeStrict(expType)) {
			mainStr = `not not ${removeBalancedParenthesisFromStringBorders(expStr)}`;
		} else {
			mainStr = expStr;
		}
	}

	if (checkNon0) {
		checks.push(extraNots % 2 ? `${expStr} == 0` : `${expStr} ~= 0`);
	}

	if (checkNaN) {
		checks.push(extraNots % 2 ? `${expStr} ~= ${expStr}` : `${expStr} == ${expStr}`);
	}

	if (checkEmptyString) {
		checks.push(`${expStr} ${extraNots % 2 ? "=" : "~"}= ""`);
	}

	if (checkTruthy || checks.length === 0) {
		checks.push(mainStr);
	}

	let condition = extraNots % 2 ? checks.join(" or ") : checks.join(" and ");
	let id: string;

	if (node) {
		const declaration = state.declarationContext.get(node);
		if (declaration) {
			if (declaration.needsLocalizing) {
				state.pushPrecedingStatements(
					node,
					state.indent + `local ${declaration.set} = ${boolify ? condition : expStr};\n`,
				);
			}
			state.currentBinaryLogicContext = id = declaration.set;
		} else {
			if (currentBinaryLogicContext) {
				id = currentBinaryLogicContext;
			} else {
				state.currentBinaryLogicContext = id = state.pushPrecedingStatementToNewId(
					node,
					`${boolify ? condition : expStr}`,
				);
			}
		}
	} else {
		id = "";
	}

	if (isAnd !== undefined) {
		condition = boolify ? id || condition : condition;
		if (isAnd === false && boolify) {
			condition = `not (${condition})`;
		}
	}

	return {
		condition,
		id,
	};
}

export function compileTruthiness(
	state: CompilerState,
	exp: ts.Expression,
	extraNots = 0,
	isAnd?: boolean,
	rhs?: ts.Expression,
	node?: ts.BinaryExpression,
) {
	const isPushed = false;

	const currentBinaryLogicContext = state.currentBinaryLogicContext;
	const { condition, id } = getExpStr(state, exp, extraNots, isAnd, node, currentBinaryLogicContext);

	if (node && rhs) {
		state.pushPrecedingStatements(exp, state.indent + `if ${condition} then -- ${node.getText()}\n`);
		state.pushIndent();
		const rhsStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, rhs));
		if (id !== rhsStr) {
			state.pushPrecedingStatements(exp, state.indent + `${id} = ${rhsStr};\n`);
		}
		state.popIndent();

		state.pushPrecedingStatements(exp, state.indent + `end;\n`);

		if (currentBinaryLogicContext === "") {
			state.currentBinaryLogicContext = "";
		}
		state.declarationContext.delete(node);
		state.getCurrentPrecedingStatementContext(node).isPushed = isPushed;
		return id;
	} else {
		// console.log("got", condition, exp.getKindName(), exp.getText());
		return condition;
	}
}
