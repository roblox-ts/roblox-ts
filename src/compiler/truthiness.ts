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
 * Ex: if ((x = f()) && g()) {}
 * So we just whitelist the nodes we can safely climb and optimize those.
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

function getBinaryExpressionType(node: ts.Expression) {
	if (ts.TypeGuards.isBinaryExpression(node)) {
		switch (node.getOperatorToken().getKind()) {
			case ts.SyntaxKind.AmpersandAmpersandToken:
				return 1;
			case ts.SyntaxKind.BarBarToken:
				return 2;
			default:
				return 0 / 0;
		}
	} else {
		return 0 / 0;
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

function getbinaryRhsExpression(state: CompilerState, node: ts.Expression) {
	let current: ts.Expression | undefined;
	let next = state.binaryRhsExpressions.get(node);
	let i = 0;

	while (next) {
		console.log(":", ++i, next.getText());
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
export function compileLogicalBinary(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: boolean,
	node: ts.BinaryExpression,
) {
	state.binaryRhsExpressions.set(node, rhs);
	state.binaryRhsExpressions.set(skipNodesUpwardsLookAhead(node) as ts.Expression, rhs);
	console.log(0, node.getText(), state.currentTruthyContext);
	// let such = state.indent.length;
	const isInTruthyCheck = isExpInTruthyCheck(node);

	if (isInTruthyCheck) {
		state.alreadyCheckedTruthyConditionals.push(skipNodesUpwardsLookAhead(node));
	}

	const lhsContext = state.enterPrecedingStatementContext();
	let expStr = compileExpression(state, lhs);
	let context: PrecedingStatementContext;
	let rhsStr: string;

	console.log(
		1,
		node.getText(),
		state.currentTruthyContext,
		getBinaryExpressionType(node),
		getBinaryExpressionType(lhs),
	);

	if (!isInTruthyCheck) {
		// 	const upperContext = state.getCurrentPrecedingStatementContext(node);
		// 	console.log(upperContext);

		// 	if (
		// 		getBinaryExpressionType(lhs) === getBinaryExpressionType(node) &&
		// 		upperContext.length > 1 &&
		// 		upperContext[upperContext.length - 1].match(/^\t*end;\n$/)
		// 	) {
		// 		// this is just a sanity check. Should always be true
		// 		extraEnd = upperContext.pop();
		// 		state.pushIndent();
		// 		console.log(lhs.getText(), ":", node.getText())
		// 	} else {

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

	const checkableTypeNode =
		(getBinaryExpressionType(node) === getBinaryExpressionType(lhs) && getbinaryRhsExpression(state, lhs)) || lhs;

	state.pushPrecedingStatements(lhs, ...lhsContext);

	const checkableTypeData = getTruthyCompileData(state, checkableTypeNode);
	let lhsStr = compileTruthyCheck(state, lhs, expStr, checkableTypeData);

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

	state.pushPrecedingStatements(
		lhs,
		state.indent +
			`if ${isAnd ? "" : "not ("}${removeBalancedParenthesisFromStringBorders(lhsStr)}${isAnd ? "" : ")"} then\n`,
	);

	if (expStr !== removeBalancedParenthesisFromStringBorders(rhsStr)) {
		context.push(makeSetStatement(state, expStr, rhsStr));
	}

	state.pushPrecedingStatements(lhs, joinIndentedLines(context, 1));
	state.pushPrecedingStatements(lhs, state.indent + `end;\n`);

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
