import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	joinIndentedLines,
	makeSetStatement,
	removeBalancedParenthesisFromStringBorders,
	skipNodesDownwards,
	skipNodesUpwardsLookAhead,
	skipNodesUpwards,
} from "../utility/general";
import { yellow } from "../utility/text";
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

// TODO: Remove once the second param to the condition callback of `getParentWhile` is added to ts-morph:

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

/** Returns whether a given node needs to preserve its value as a truthiness statement.
 * If it is within an if statement, for example, we can throw away in between values. See docs below.
 * However, it is also possible for expressions within an if statement to require the proper value.
 * So we just whitelist the nodes we can safely climb and optimize those.
 * @example
 * if ((x = f()) && g()) {} // everything in the rhs of `x = ` can't be optimized
 */
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

/** Helper function which returns
 * 1 if it is an `&&` binaryExpression,
 * 2 if it is an `||` binaryExpression,
 * Otherwise, this returns NaN.
 * That way, comparing two values returned from this function will be false when both are non-BinaryExpressions
 * (as opposed to typing this as boolean | undefined, where undefined === undefined would yield true)
 */
function getBinaryExpressionType(node: ts.Expression) {
	if (ts.TypeGuards.isBinaryExpression(node)) {
		switch (node.getOperatorToken().getKind()) {
			case ts.SyntaxKind.AmpersandAmpersandToken:
				return 1;
			case ts.SyntaxKind.BarBarToken:
				return 2;
			default:
				return NaN;
		}
	} else {
		return NaN;
	}
}

function compileRhs(
	state: CompilerState,
	rhs: ts.Expression,
	isInTruthyCheck: boolean,
): [PrecedingStatementContext, string] {
	state.enterPrecedingStatementContext();
	let rhsStr = compileExpression(state, rhs);

	if (isInTruthyCheck) {
		rhsStr = compileTruthyCheck(state, rhs, rhsStr);
	}

	return [state.exitPrecedingStatementContext(), rhsStr];
}

function getBinaryRhsExpression(state: CompilerState, node: ts.Expression, debug = false) {
	let current: ts.Expression | undefined;
	let next = state.binaryRhsExpressions.get(node);
	// let i = 0;

	while (next) {
		// if (debug) console.log(":", ++i, next.getText());
		current = skipNodesDownwards(next) as ts.Expression;
		next = state.binaryRhsExpressions.get(current);
	}

	return current;
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
export function compileLogicalBinary2(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: boolean,
	node: ts.BinaryExpression,
) {
	state.binaryRhsExpressions.set(node, rhs);
	const isInTruthyCheck = isExpInTruthyCheck(node);

	if (isInTruthyCheck) {
		state.alreadyCheckedTruthyConditionals.push(skipNodesUpwardsLookAhead(node));
	}

	const lhsContext = state.enterPrecedingStatementContext();
	let expStr = compileExpression(state, lhs);
	let context: PrecedingStatementContext;
	let rhsStr: string;

	if (!isInTruthyCheck) {
		if (state.currentTruthyContext) {
			state.exitPrecedingStatementContext();
			[context, rhsStr] = compileRhs(state, rhs, isInTruthyCheck);
			if (state.currentTruthyContext !== removeBalancedParenthesisFromStringBorders(expStr)) {
				lhsContext.push(makeSetStatement(state, state.currentTruthyContext, expStr));
			}
			expStr = state.currentTruthyContext;
		} else {
			state.currentTruthyContext = expStr = state.pushPrecedingStatementToNewId(lhs, expStr);
			state.exitPrecedingStatementContext();
			[context, rhsStr] = compileRhs(state, rhs, isInTruthyCheck);
		}
	} else {
		state.exitPrecedingStatementContext();
		[context, rhsStr] = compileRhs(state, rhs, isInTruthyCheck);
	}

	const subLhs = skipNodesDownwards(lhs);

	const checkableTypeNode =
		(getBinaryExpressionType(node) === getBinaryExpressionType(subLhs) && getBinaryRhsExpression(state, subLhs)) ||
		lhs;

	console.log(1, "get", node.getText(), ">>", checkableTypeNode.getText());
	state.pushPrecedingStatements(lhs, ...lhsContext);

	const checkableTypeData = getTruthyCompileData(state, checkableTypeNode);
	let lhsStr = compileTruthyCheck(state, lhs, expStr, checkableTypeData);

	console.log(node.getText(), getBinaryExpressionType(node), getBinaryExpressionType(subLhs));

	if (context.length === 0) {
		const luaOp = isAnd ? " and " : " or ";

		if (
			isInTruthyCheck ||
			(!isAnd && checkableTypeData.checkLuaTruthy) ||
			(checkableTypeData.numRefs === 1 && checkableTypeData.checkLuaTruthy)
		) {
			return lhsStr + luaOp + rhsStr;
		}
	} else if (isInTruthyCheck) {
		lhsStr = expStr = state.pushToDeclarationOrNewId(node, lhsStr);
	}

	let conditionStr = removeBalancedParenthesisFromStringBorders(lhsStr);

	if (!isAnd) {
		conditionStr = `not (${conditionStr})`;
	}

	state.pushPrecedingStatements(lhs, state.indent + `if ${conditionStr} then\n`);

	if (expStr !== removeBalancedParenthesisFromStringBorders(rhsStr)) {
		context.push(makeSetStatement(state, expStr, rhsStr));
	}

	state.pushPrecedingStatements(lhs, joinIndentedLines(context, 1));

	// if (getBinaryExpressionType(node) !== getBinaryExpressionType(skipNodesUpwards(node.getParent()))) {
	// 	console.log(2, node.getText());
	// 	const x = state.indent.length - originalLength;

	// 	for (let i = 0; i < x; i++) {
	// 		state.pushPrecedingStatements(lhs, state.indent + `end;\n`);
	// 		state.popIndent();
	// 	}
	// 	state.pushPrecedingStatements(lhs, state.indent + `end;\n`);
	// }

	state.pushPrecedingStatements(lhs, state.indent + `end;\n`);

	// if (checkableTypeNode !== lhs) {
	// state.popIndent();
	// }

	// if (extraEnd && !getBinaryExpressionType(node.getParent())) {
	// 	const target = state.indent.length - such;
	// 	for (let i = 0; i < target; i++) {
	// 		console.log(i);
	// 		state.popIndent();
	// 		state.pushPrecedingStatements(lhs, state.indent + `end;\n`);
	// 	}
	// 	// 	state.popIndent()
	// }
	return expStr;
}

export function compileLogicalBinary(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: boolean,
	node: ts.BinaryExpression,
) {
	const stack = new Array<ts.Node>();
	stack.push();
}

/** Returns an object specifying how many checks a given expression needs */
function getTruthyCompileData(state: CompilerState, exp: ts.Expression) {
	const expType = getType(exp);

	if (isTupleType(expType)) {
		throw new CompilerError(
			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
			exp,
			CompilerErrorType.LuaTupleInConditional,
		);
	}

	const isUnknown = isUnknowableType(expType);
	let checkNaN = isUnknown || isNumberTypeLax(expType);
	const checkNon0 = isUnknown || checkNaN || isLiterally0Lax(expType);

	if (checkNon0) {
		// TS doesn't handle the falsy number type very well at the time of writing.
		// TS will frequently evaluate falsy numbers to `0`, even though it should be `0 | NaN`
		// (NaN doesn't exist as a type-language primitive at the moment)
		// Example: const f = (a: number, b: string) => a && b;
		// `f` returns `string | 0`, when it should return `string | 0 | NaN`
		// For now, we are going to pretend that `0` means `0 | NaN`
		checkNaN = true;
	}

	const checkEmptyString = isUnknown || isFalsyStringTypeLax(expType);
	const checkLuaTruthy = isUnknown || isBoolishTypeLax(expType);
	const numRefs = 2 * +checkNaN + +checkNon0 + +checkEmptyString + +checkLuaTruthy;

	return { checkNon0, checkNaN, checkEmptyString, checkLuaTruthy, numRefs };
}

/** Compiles a given expression and check compileData and assembles an `and` chain for it. */
export function compileTruthyCheck(
	state: CompilerState,
	exp: ts.Expression,
	expStr = compileExpression(state, exp),
	compileData = getTruthyCompileData(state, exp),
) {
	if (state.alreadyCheckedTruthyConditionals.includes(skipNodesUpwardsLookAhead(exp))) {
		return expStr;
	}

	const { checkNon0, checkNaN, checkEmptyString, checkLuaTruthy, numRefs } = compileData;

	expStr = removeBalancedParenthesisFromStringBorders(expStr);

	if (!isValidLuaIdentifier(expStr)) {
		if (numRefs > 1) {
			console.log(expStr, (expStr = state.pushPrecedingStatementToNewId(exp, expStr)));
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

	if (checkLuaTruthy || checks.length === 0) {
		checks.push(expStr);
	}

	const result = checks.join(" and ");

	if (state.logTruthyDifferences && (checkNon0 || checkNaN || checkEmptyString)) {
		console.log(
			"%s:%d:%d - %s %s",
			exp.getSourceFile().getFilePath(),
			exp.getStartLineNumber(),
			exp.getNonWhitespaceStart() - exp.getStartLinePos(),
			yellow("Compiler Warning:"),
			"`" +
				exp.getText() +
				"` will be checked against " +
				[checkNon0 ? "0" : undefined, checkNaN ? "NaN" : undefined, checkEmptyString ? `""` : undefined]
					.filter(a => a !== undefined)
					.join(", "),
		);
	}

	return checks.length > 1 ? `(${result})` : result;
}
