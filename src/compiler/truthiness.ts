import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	joinIndentedLines,
	makeSetStatement,
	removeBalancedParenthesisFromStringBorders,
	skipNodesUpwardsLookAhead,
} from "../utility/general";
import {
	getType,
	isBoolishTypeLax,
	isFalsyStringTypeLax,
	isLiterally0Lax,
	isNumberTypeLax,
	isTupleType,
	isUnknowableType,
} from "../utility/type";
import { isValidLuaIdentifier } from "./security";

// TODO: Remove once `getParentWhile` is added to ts-morph:
/**
 * Goes up the parents (ancestors) of the node while a condition is true.
 * Returns undefined if the initial parent doesn't match the condition.
 * @param condition - Condition that tests the parent to see if the expression is true.
 */
function getParentWhile<T extends ts.Node>(
	myNode: ts.Node,
	condition: (parent: ts.Node, node: ts.Node) => parent is T,
): T | undefined;

/**
 * Goes up the parents (ancestors) of the node while a condition is true.
 * Returns undefined if the initial parent doesn't match the condition.
 * @param condition - Condition that tests the parent to see if the expression is true.
 */
function getParentWhile(myNode: ts.Node, condition: (parent: ts.Node, node: ts.Node) => boolean): ts.Node | undefined;
function getParentWhile(myNode: ts.Node, condition: (parent: ts.Node, node: ts.Node) => boolean) {
	let node: ts.Node | undefined;
	let parent: ts.Node | undefined = myNode.getParent();

	if (parent && condition(parent, myNode)) {
		do {
			node = parent;
			parent = node.getParent();
		} while (parent && condition(parent, node));
	}

	return node;
}

export function isExpInTruthyCheck(node: ts.Node) {
	const previous =
		getParentWhile(node, (p, n) => {
			if (ts.TypeGuards.isParenthesizedExpression(p) || ts.TypeGuards.isNonNullExpression(p)) {
				return true;
			} else if (ts.TypeGuards.isBinaryExpression(p)) {
				const opKind = p.getOperatorToken().getKind();
				return opKind === ts.SyntaxKind.AmpersandAmpersandToken || opKind === ts.SyntaxKind.BarBarToken;
			} else if (ts.TypeGuards.isConditionalExpression(p) && (p.getWhenTrue() === n || p.getWhenFalse() === n)) {
				return true;
			} else {
				return false;
			}
		}) || node;

	const top = previous.getParent();

	if (top) {
		if (
			(ts.TypeGuards.isConditionalExpression(top) || ts.TypeGuards.isForStatement(top)) &&
			top.getCondition() === previous
		) {
			return true;
		} else if (
			ts.TypeGuards.isPrefixUnaryExpression(top) &&
			top.getOperatorToken() === ts.SyntaxKind.ExclamationToken &&
			top.getOperand() === previous
		) {
			return true;
		} else if (
			(ts.TypeGuards.isIfStatement(top) ||
				ts.TypeGuards.isWhileStatement(top) ||
				ts.TypeGuards.isDoStatement(top)) &&
			top.getExpression() === previous
		) {
			return true;
		}
	}

	return false;
}

/* If it is in a truthy check, we can throw away the middle values when possible
For example, given strings a, b, c, the statement if (a && b && c) becomes:

	local _0 = a;
	if a ~= "" then
		_0 = b;
		if _0 ~= "" then
			_0 = c;
		end;
	end;

	if _0 ~= "" then
	end

However, because the "in between values" are effectively thrown away here,
we can optimize this case to:

	if a ~= "" and b ~= "" and c ~= "" then
	end;

alreadyCheckedTruthyConditionals is effectively a whitelist of nodes which were optimized in this way
*/
export function compileLogicalBinary(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: boolean,
	node: ts.BinaryExpression,
) {
	const isInTruthyCheck = isExpInTruthyCheck(node);
	const lhsData = getTruthyCompileData(state, lhs, true);
	let expStr: string;
	if (isInTruthyCheck) {
		state.alreadyCheckedTruthyConditionals.push(skipNodesUpwardsLookAhead(node));
	}

	expStr = compileExpression(state, lhs);

	if (!isInTruthyCheck || lhsData.numChecks > 1) {
		expStr = state.pushPrecedingStatementToNewId(lhs, expStr);
	}

	let lhsStr = compileTruthyCheck(state, lhs, expStr, lhsData);
	state.enterPrecedingStatementContext();
	let rhsStr = compileExpression(state, rhs);
	if (isInTruthyCheck) {
		rhsStr = compileTruthyCheck(state, rhs, rhsStr);
	}
	const context = state.exitPrecedingStatementContext();

	if (context.length === 0) {
		if (isInTruthyCheck) {
			return lhsStr + (isAnd ? " and " : " or ") + rhsStr;
		} else if (!isAnd && lhsData.checkTruthy) {
			state.pushPrecedingStatements(node, makeSetStatement(state, expStr, lhsStr + " or " + rhsStr));
			return expStr;
		} else if (lhsData.numChecks === 1 && lhsData.checkTruthy) {
			return lhsStr + (isAnd ? " and " : " or ") + rhsStr;
		}
	} else if (isInTruthyCheck) {
		expStr = state.pushToDeclarationOrNewId(node, lhsStr);
		lhsStr = expStr;
	}

	state.pushPrecedingStatements(
		lhs,
		state.indent +
			`if ${isAnd ? "" : "not ("}${removeBalancedParenthesisFromStringBorders(lhsStr)}${isAnd ? "" : ")"} then\n`,
	);
	context.push(makeSetStatement(state, expStr, rhsStr));
	state.pushPrecedingStatements(lhs, joinIndentedLines(context, 1));
	state.pushPrecedingStatements(lhs, state.indent + `end;\n`);
	return expStr;
}

function getTruthyCompileData(state: CompilerState, exp: ts.Expression, pushy = false) {
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
	const checkNon0 = isUnknown || checkNaN || isLiterally0Lax(expType);
	const checkEmptyString = isUnknown || isFalsyStringTypeLax(expType);
	const checkTruthy = isUnknown || isBoolishTypeLax(expType);
	const numChecks = +checkNaN + +checkNon0 + +checkEmptyString + +checkTruthy;

	return { checkNon0, checkNaN, checkEmptyString, checkTruthy, numChecks };
}

export function compileTruthyCheck(
	state: CompilerState,
	exp: ts.Expression,
	expStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, exp)),
	compileData = getTruthyCompileData(state, exp),
) {
	if (state.alreadyCheckedTruthyConditionals.includes(skipNodesUpwardsLookAhead(exp))) {
		return expStr;
	}
	expStr = removeBalancedParenthesisFromStringBorders(expStr);

	const { checkNon0, checkNaN, checkEmptyString, checkTruthy, numChecks } = compileData;

	if (!isValidLuaIdentifier(expStr)) {
		if (numChecks > 1) {
			expStr = state.pushPrecedingStatementToNewId(exp, expStr);
		} else {
			expStr = `(${expStr})`;
		}
	}

	const checks = new Array<string>();

	if (checkNon0) {
		checks.push(`${expStr} ~= 0`);
	}

	if (checkNaN) {
		checks.push(`${expStr} == ${expStr}`);
	}

	if (checkEmptyString) {
		checks.push(`${expStr} ~= ""`);
	}

	if (checkTruthy || checks.length === 0) {
		checks.push(expStr);
	}

	const result = checks.join(" and ");

	return checks.length > 1 ? `(${result})` : result;
}
