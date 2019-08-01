import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	joinIndentedLines,
	makeSetStatement,
	removeBalancedParenthesisFromStringBorders,
	skipNodesDownwardsInverse,
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

function isExpInTruthyCheck(node: ts.Node) {
	// TODO: Support middle argument of for loops
	let i = 0;
	const parent = getParentWhile(node, (p, n) => {
		i++;
		if (ts.TypeGuards.isParenthesizedExpression(p) || ts.TypeGuards.isNonNullExpression(p)) {
			return true;
		} else if (ts.TypeGuards.isBinaryExpression(p)) {
			const opKind = p.getOperatorToken().getKind();
			return opKind === ts.SyntaxKind.AmpersandAmpersandToken || opKind === ts.SyntaxKind.BarBarToken;
			// } else if (ts.TypeGuards.isConditionalExpression(p) && (p.getWhenTrue() === n || p.getWhenFalse() === n)) {
			// 	return true;
		} else {
			return false;
		}
	});

	const previous = parent || node;
	const top = previous.getParent();

	if (top) {
		if (ts.TypeGuards.isConditionalExpression(top) && top.getCondition() === previous) {
			return parent ? i : i; // Number.POSITIVE_INFINITY;
		} else if (
			ts.TypeGuards.isPrefixUnaryExpression(top) &&
			top.getOperatorToken() === ts.SyntaxKind.ExclamationToken &&
			top.getOperand() === previous
		) {
			return parent ? i : i; // Number.POSITIVE_INFINITY;
		} else if (
			(ts.TypeGuards.isIfStatement(top) ||
				ts.TypeGuards.isWhileStatement(top) ||
				ts.TypeGuards.isDoStatement(top)) &&
			top.getExpression() === previous
		) {
			return parent ? i : i; // Number.POSITIVE_INFINITY;
		}
	}

	return 0;

	// return parent
	// 	? previous.getKindName() + " " + previous.getText() + ", " + parent.getKindName() + " " + parent.getText()
	// 	: undefined;
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
	// let id: string | undefined;
	// const currentBinaryLogicContext = state.currentBinaryLogicContext;
	// let isPushed = false;
	// const declaration = state.declarationContext.get(node);

	// if (declaration) {
	// 	if (declaration.needsLocalizing) {
	// 		// state.pushPrecedingStatements(node, state.indent + `local `);
	// 	}

	// 	state.currentBinaryLogicContext = id = declaration.set;
	// 	state.declarationContext.delete(node);
	// } else {
	// 	if (currentBinaryLogicContext === "") {
	// 		state.currentBinaryLogicContext = id = state.pushPrecedingStatementToNewId(node, "");
	// 		// isPushed = true;
	// 	} else {
	// 		id = currentBinaryLogicContext;
	// 	}
	// }

	const isInTruthyCheck = isExpInTruthyCheck(node);
	const lhsData = getTruthyCompileData(state, lhs, true);
	let expStr: string;
	if (isInTruthyCheck) {
		const skippingNode = skipNodesDownwardsInverse(node);
		state.alreadyCheckedTruthyConditionals.push(skippingNode);
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
		rhsStr = rhsStr;
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

	// console.log(expStr);

	// if (expStr !== state.currentBinaryLogicContext && state.currentBinaryLogicContext) {
	// 	if (state.currentBinaryLogicContext === "return") {
	// 		state.currentBinaryLogicContext = state.pushPrecedingStatementToNewId(exp, expStr);
	// 	} else {
	// 		state.pushPrecedingStatements(exp, state.indent + `${state.currentBinaryLogicContext} = ${expStr};\n`);
	// 		expStr = state.currentBinaryLogicContext;
	// 	}
	// }

	// const currentBinaryLogicContext = state.currentBinaryLogicContext;

	// console.log(1, expStr, exp.getText(), currentBinaryLogicContext);

	// const { currentBinaryLogicContext } = state;

	// if (pushy || (!isValidLuaIdentifier(expStr) && numChecks > 1)) {
	// 	if (currentBinaryLogicContext) {
	// 		state.pushPrecedingStatements(exp, state.indent + `::${currentBinaryLogicContext} = ${expStr};\n`);
	// 		expStr = currentBinaryLogicContext;
	// 	} else {
	// 		console.log("pushing", expStr);
	// 		state.currentBinaryLogicContext = expStr = state.pushPrecedingStatementToNewId(exp, expStr);
	// 	}
	// }

	return { checkNon0, checkNaN, checkEmptyString, checkTruthy, numChecks };
}

export function compileTruthyCheck(
	state: CompilerState,
	exp: ts.Expression,
	expStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, exp)),
	compileData = getTruthyCompileData(state, exp),
) {
	// console.log(exp.getKindName(), exp.getText(), ":", expStr);
	if (state.alreadyCheckedTruthyConditionals.includes(exp)) {
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
	// let shouldWrap = false;

	if (checkNon0) {
		checks.push(`${expStr} ~= 0`);
		// shouldWrap = true;
	}

	if (checkNaN) {
		checks.push(`${expStr} == ${expStr}`);
		// shouldWrap = true;
	}

	if (checkEmptyString) {
		checks.push(`${expStr} ~= ""`);
		// shouldWrap = true;
	}

	if (checkTruthy || checks.length === 0) {
		checks.push(expStr);
	}

	const result = checks.join(" and ");

	// if (currentBinaryLogicContext === "") {
	// 	state.currentBinaryLogicContext = "";
	// }

	// getParentWhile(exp, (p, n) => {
	// 	if (ts.TypeGuards.isParenthesizedExpression(p) || ts.TypeGuards.isNonNullExpression(p)) {
	// 		return true;
	// 	} else if (ts.TypeGuards.isBinaryExpression(p)) {
	// 		const opKind = p.getOperatorToken().getKind();
	// 		return opKind === ts.SyntaxKind.AmpersandAmpersandToken || opKind === ts.SyntaxKind.BarBarToken;
	// 		// } else if (ts.TypeGuards.isConditionalExpression(p) && (p.getWhenTrue() === n || p.getWhenFalse() === n)) {
	// 		// 	return true;
	// 	} else {
	// 		return false;
	// 	}
	// });
	return checks.length > 1 ? `(${result})` : result;

	// return `(${result})`;
}

// function getExpStr(
// 	state: CompilerState,
// 	exp: ts.Expression,
// 	extraNots: number,
// 	isAnd?: boolean,
// 	node?: ts.BinaryExpression,
// 	currentBinaryLogicContext?: string,
// ) {
// 	while (ts.TypeGuards.isPrefixUnaryExpression(exp) && exp.getOperatorToken() === ts.SyntaxKind.ExclamationToken) {
// 		exp = skipNodesDownwards(exp.getOperand());
// 		extraNots++;
// 	}

// 	const expStr = compileExpression(state, exp);
// 	const expType = getType(exp);

// 	if (isTupleType(expType)) {
// 		throw new CompilerError(
// 			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
// 			exp,
// 			CompilerErrorType.LuaTupleInConditional,
// 		);
// 	}

// 	const isUnknown = isUnknowableType(expType);

// 	const checkNaN = isUnknown || isNumberTypeLax(expType);
// 	const checkNon0 = isUnknown || checkNaN || is0TypeLax(expType);
// 	const checkEmptyString = isUnknown || isFalsyStringTypeLax(expType);
// 	const checkTruthy = isUnknown || isBoolishTypeLax(expType);

// 	const checks = new Array<string>();
// 	const boolify = extraNots > 0;

// 	// console.log(boolify, exp.getText());
// 	if (extraNots === 0 && isAnd === false) {
// 		extraNots++;
// 	}

// 	let mainStr: string;

// 	if (extraNots % 2) {
// 		mainStr = `not ${removeBalancedParenthesisFromStringBorders(expStr)}`;
// 	} else {
// 		if (boolify && !isBooleanTypeStrict(expType)) {
// 			mainStr = `not not ${removeBalancedParenthesisFromStringBorders(expStr)}`;
// 		} else {
// 			mainStr = expStr;
// 		}
// 	}

// 	if (checkNon0) {
// 		checks.push(extraNots % 2 ? `${expStr} == 0` : `${expStr} ~= 0`);
// 	}

// 	if (checkNaN) {
// 		checks.push(extraNots % 2 ? `${expStr} ~= ${expStr}` : `${expStr} == ${expStr}`);
// 	}

// 	if (checkEmptyString) {
// 		checks.push(`${expStr} ${extraNots % 2 ? "=" : "~"}= ""`);
// 	}

// 	if (checkTruthy || checks.length === 0) {
// 		checks.push(mainStr);
// 	}

// 	let condition = extraNots % 2 ? checks.join(" or ") : checks.join(" and ");
// 	let id: string;

// 	if (node) {
// 		const declaration = state.declarationContext.get(node);
// 		if (declaration) {
// 			if (declaration.needsLocalizing) {
// 				state.pushPrecedingStatements(
// 					node,
// 					state.indent + `local ${declaration.set} = ${boolify ? condition : expStr};\n`,
// 				);
// 			}
// 			state.currentBinaryLogicContext = id = declaration.set;
// 		} else {
// 			if (currentBinaryLogicContext) {
// 				id = currentBinaryLogicContext;
// 			} else {
// 				state.currentBinaryLogicContext = id = state.pushPrecedingStatementToNewId(
// 					node,
// 					`${boolify ? condition : expStr}`,
// 				);
// 			}
// 		}
// 	} else {
// 		id = "";
// 	}

// 	if (isAnd !== undefined) {
// 		condition = boolify ? id || condition : condition;
// 		if (isAnd === false && boolify) {
// 			condition = `not (${condition})`;
// 		}
// 	}

// 	return {
// 		condition,
// 		id,
// 	};
// }

// export function compileTruthiness(
// 	state: CompilerState,
// 	exp: ts.Expression,
// 	extraNots = 0,
// 	isAnd?: boolean,
// 	rhs?: ts.Expression,
// 	node?: ts.BinaryExpression,
// ) {
// 	const isPushed = false;

// 	const currentBinaryLogicContext = state.currentBinaryLogicContext;
// 	const { condition, id } = getExpStr(state, exp, extraNots, isAnd, node, currentBinaryLogicContext);

// 	if (node && rhs) {
// 		state.pushPrecedingStatements(exp, state.indent + `if ${condition} then -- ${node.getText()}\n`);
// 		state.pushIndent();
// 		const rhsStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, rhs));
// 		if (id !== rhsStr) {
// 			state.pushPrecedingStatements(exp, state.indent + `${id} = ${rhsStr};\n`);
// 		}
// 		state.popIndent();

// 		state.pushPrecedingStatements(exp, state.indent + `end;\n`);

// 		if (currentBinaryLogicContext === "") {
// 			state.currentBinaryLogicContext = "";
// 		}
// 		state.declarationContext.delete(node);
// 		state.getCurrentPrecedingStatementContext(node).isPushed = isPushed;
// 		return id;
// 	} else {
// 		// console.log("got", condition, exp.getKindName(), exp.getText());
// 		return condition;
// 	}
// }
