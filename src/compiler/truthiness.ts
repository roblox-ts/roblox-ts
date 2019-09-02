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
	isNonLiteralNumberTypeLax,
	isTupleType,
	isUnknowableType,
} from "../utility/type";
import { shouldWrapExpression } from "./call";
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
 * 2 if it is an `&&` binaryExpression,
 * 1 if it is an `||` binaryExpression,
 * Otherwise, this returns 0.
 * That way, comparing two values returned from this function will be false when both are non-BinaryExpressions
 * (as opposed to typing this as boolean | undefined, where undefined === undefined would yield true)
 */
function getBinaryExpressionType(node: ts.Expression): 0 | 1 | 2 {
	if (ts.TypeGuards.isBinaryExpression(node)) {
		switch (node.getOperatorToken().getKind()) {
			case ts.SyntaxKind.AmpersandAmpersandToken:
				return 2;
			case ts.SyntaxKind.BarBarToken:
				return 1;
			default:
				return 0;
		}
	} else {
		return 0;
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

/** The binary logical operators (selection operators) are associative,
 * This means that we can grab all the &&/|| operations on the same level and flatten the AST.
 * Returns an array of all operands between the right kind of operation:
 * @example
 * // These will all return [a, b, c, d, e]
 * a && b && c && d && e
 * (a && b) && (c && d) && e
 * a && b && (c && (d && e))
 *
 * // We want these to evaluate the same, even with different AST's
 *        a && b && c && d
 *       /                \
 *     a && b && c         d
 *    /           \
 *   a && b         c
 *  /      \
 * a        b
 *
 * vs.
 *
 *        a && (b && (c && d))
 *       /            \
 *      a        (b && (c && d))
 *               /          \
 *              b          (c && d)
 *                         /      \
 *                        c        d
 */
export function preprocessLogicalBinary3(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	node: ts.BinaryExpression,
	stack: Array<ts.Expression>,
) {
	const subLhs = skipNodesDownwards(lhs);

	if (
		ts.TypeGuards.isBinaryExpression(subLhs) &&
		subLhs.getOperatorToken().getKind() === node.getOperatorToken().getKind()
	) {
		preprocessLogicalBinary3(state, subLhs.getLeft(), subLhs.getRight(), subLhs, stack);
	} else {
		stack.push(subLhs);
	}

	const subRhs = skipNodesDownwards(rhs);

	if (
		ts.TypeGuards.isBinaryExpression(subRhs) &&
		subRhs.getOperatorToken().getKind() === node.getOperatorToken().getKind()
	) {
		preprocessLogicalBinary3(state, subRhs.getLeft(), subRhs.getRight(), subRhs, stack);
	} else {
		stack.push(subRhs);
	}
}

/** A basic AST-ish object into which we convert LogicalBinary expressions.
 * Easier to optimize than the default TS AST.
 */
interface NestedExpressions {
	exprs: Array<ts.Expression | NestedExpressions>;
	isAnd: boolean;
}

function isNestedExpressions(x: ts.Expression | NestedExpressions): x is NestedExpressions {
	return "exprs" in x && "isAnd" in x;
}

function logNestedExpression(x: NestedExpressions): any {
	return x.exprs.map(a => {
		if (isNestedExpressions(a)) {
			return logNestedExpression(a);
		} else {
			return a.getText();
		}
	});
}

/**
 * Preprocesses a logical binary part of the AST and converts it to a more friendly format we can optimize easier.
 * Turns it into a `NestedExpressions` object.
 */
export function preprocessLogicalBinary(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: 0 | 1 | 2,
	stuff: NestedExpressions,
) {
	// console.log(isAnd === 2 ? "&&" : "||", lhs.getText() + "\t\t" + rhs.getText());
	for (const side of [skipNodesDownwards(lhs), skipNodesDownwards(rhs)]) {
		if (ts.TypeGuards.isBinaryExpression(side)) {
			const isOpAndToken = getBinaryExpressionType(side);

			if (isOpAndToken === isAnd) {
				preprocessLogicalBinary(state, side.getLeft(), side.getRight(), isOpAndToken, stuff);
			} else if (isOpAndToken) {
				stuff.exprs.push(
					preprocessLogicalBinary(state, side.getLeft(), side.getRight(), isOpAndToken, {
						exprs: new Array(),
						isAnd: isOpAndToken === 2,
					}),
				);
			} else {
				stuff.exprs.push(side);
			}
		} else {
			stuff.exprs.push(side);
		}
	}

	return stuff;
}

export function compileLogicalBinary3(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: boolean,
	node: ts.BinaryExpression,
) {
	const myStack = new Array<ts.Expression>();
	preprocessLogicalBinary3(state, lhs, rhs, node, myStack);
	// console.log(myStack.map(a => a.getText()));
	const stack = new Array<[ts.BinaryExpression, ts.Expression, ts.Expression]>();
	let subLhs = skipNodesDownwards(lhs);

	while (
		ts.TypeGuards.isBinaryExpression(subLhs) &&
		subLhs.getOperatorToken().getKind() === node.getOperatorToken().getKind()
	) {
		stack.push([node, subLhs, rhs]);
		[node, lhs, rhs] = [subLhs, skipNodesDownwards(subLhs.getLeft()), skipNodesDownwards(subLhs.getRight())];
		subLhs = skipNodesDownwards(lhs);
	}

	// stack.push([node, lhs, rhs]);

	const id = state.getNewId();
	const lhsStr = compileExpression(state, subLhs);
	const results = new Array<string>();
	results.push(state.indent, "local ", id, " = ", lhsStr, ";\n");
	let checkableNode = lhs;
	let ends = 0;
	let x = 0;

	while (true) {
		x++;
		ends++;
		results.push(state.indent, "if ", compileTruthyCheck(state, checkableNode, id), " then\n");
		state.pushIndent();

		do {
			subLhs = rhs;
			while (
				ts.TypeGuards.isBinaryExpression(subLhs) &&
				subLhs.getOperatorToken().getKind() === node.getOperatorToken().getKind()
			) {
				stack.push(
					([node, lhs, rhs] = [
						subLhs,
						skipNodesDownwards(subLhs.getLeft()),
						skipNodesDownwards(subLhs.getRight()),
					]),
				);
				subLhs = skipNodesDownwards(lhs);
			}
		} while (ts.TypeGuards.isBinaryExpression(subLhs));

		// console.log(1, stack.map(([_, b, c]) => [b.getText(), c.getText()]));

		[node, lhs, rhs] = stack.pop()!;
		// console.log(2, [lhs.getText(), rhs.getText()]);
		state.enterPrecedingStatementContext(results);
		const rhsStr = compileExpression(state, subLhs);
		state.exitPrecedingStatementContext();
		results.push(state.indent, id, " = ", rhsStr, ";\n");

		if (x > 10) {
			break;
		}

		// while (
		// 	ts.TypeGuards.isBinaryExpression(subRhs) &&
		// 	subRhs.getOperatorToken().getKind() === node.getOperatorToken().getKind()
		// ) {
		// 	stack.push([node, subRhs, rhs]);
		// 	[node, lhs, rhs] = [subRhs, skipNodesDownwards(subRhs.getLeft()), skipNodesDownwards(subRhs.getRight())];
		// 	subRhs = skipNodesDownwards(rhs);
		// }

		// stack.push([node, subRhs, rhs]);

		if (stack.length) {
			checkableNode = rhs;
			[node, lhs, rhs] = stack.pop()!;
		} else {
			break;
		}
	}

	for (let i = 0; i < ends; i++) {
		state.popIndent();
		results.push(state.indent, "end;\n");
	}

	state.pushPrecedingStatements(node, results.join(""));
	return id;
}

export function compileLogicalBinary4(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: boolean,
	node: ts.BinaryExpression,
) {
	if (!state.topTruthyNode) {
		state.topTruthyNode = node;
	}

	const isInTruthyCheck = isExpInTruthyCheck(node);

	if (isInTruthyCheck) {
		state.alreadyCheckedTruthyConditionals.push(skipNodesUpwardsLookAhead(node));
	}

	const stack = new Array<ts.Expression>();
	preprocessLogicalBinary3(state, lhs, rhs, node, stack);

	const nestedExpressions = { exprs: new Array(), isAnd };
	preprocessLogicalBinary(state, lhs, rhs, isAnd, nestedExpressions);
	console.log("hey", logNestedExpression(nestedExpressions));
	const results = new Array<string>();

	// if (isInTruthyCheck) {
	// 	if (state.topTruthyNode === node) {
	// 		state.topTruthyNode = undefined;
	// 		state.currentTruthyContext = "";
	// 	}

	// 	const stuff = new Array<string>()
	// 	for (const check of stack) {
	// 		state.enterPrecedingStatementContext();
	// 		const checkStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, check));

	// 		if (!isValidLuaIdentifier(checkStr)) {

	// 		}
	// 		stuff.push(checkStr);
	// 		const { length } = state.exitPrecedingStatementContext();

	// 		if (length > 0) {
	// 			console.log(checkStr)
	// 		}
	// 	}

	// 	return stuff.join(isAnd ? " and " : " or ");
	// }

	let { currentTruthyContext } = state;
	let id = currentTruthyContext;

	if (!id) {
		console.log(
			"id",
			(state.currentTruthyContext = id = state.getNewId()),
			"at",
			node.getText(),
			currentTruthyContext,
		);
		state.hasTruthyContextBeenUsed = false;
	}

	const checkData = stack.map(check => {
		state.enterPrecedingStatementContext();
		const expStr = compileExpression(state, check);
		const checkContext = state.exitPrecedingStatementContext();
		const compileData = getTruthyCompileData(state, check);

		return {
			check,
			checkContext,
			compileData,
			expStr,
			inlinable: checkContext.length === 0 && compileData.numRefs === 1,
		};
	});

	const op = isAnd ? " and " : " or ";

	if (checkData.every(({ inlinable }, i) => i === 0 || inlinable)) {
		if (!checkData[0].inlinable) {
			state.pushPrecedingStatements(node, ...checkData[0].checkContext);
		}

		if (state.topTruthyNode === node) {
			state.topTruthyNode = undefined;
			state.currentTruthyContext = "";
			state.hasTruthyContextBeenUsed = undefined;
		}

		return checkData
			.map(({ check, expStr, compileData }) => compileTruthyCheck(state, check, expStr, compileData))
			.join(op);
	}

	let closingEnds = 0;
	state.enterPrecedingStatementContext(results);

	for (let i = 0; i < stack.length; i++) {
		let {
			// tslint:disable-next-line: prefer-const
			[i]: { checkContext, compileData, expStr, check },
		} = checkData;

		let checkStr = compileTruthyCheck(state, check, expStr, compileData);

		if (isInTruthyCheck) {
			expStr = checkStr;
			checkStr = id;
		}

		results.push(joinIndentedLines(checkContext, closingEnds));

		let { [i + 1]: nextData } = checkData;
		while (nextData && nextData.inlinable) {
			expStr += op + compileTruthyCheck(state, nextData.check, nextData.expStr, nextData.compileData);
			({ [++i + 1]: nextData } = checkData);
		}

		if (id !== expStr) {
			console.log(id, "=", expStr, `"${currentTruthyContext}"`, node.getText());

			let declarationPrefix = "";

			if (!state.hasTruthyContextBeenUsed) {
				state.hasTruthyContextBeenUsed = true;
				declarationPrefix = "local ";
			}

			results.push(state.indent, declarationPrefix, id, " = ", expStr, ";\n");
		}

		if (i < stack.length - 1) {
			results.push(
				state.indent,
				"if ",
				isAnd ? checkStr : checkStr === id ? `not ${checkStr}` : `not (${checkStr})`,
				" then\n",
			);
			state.pushIndent();
			closingEnds++;
		}
	}

	state.exitPrecedingStatementContext();

	// const expStr = compileExpression(state, stack[0]);

	// const { currentTruthyContext } = state;
	// let id = currentTruthyContext;

	// if (!id) {
	// 	state.currentTruthyContext = id = state.getNewId();
	// }

	// if (id !== expStr) {
	// 	results.push(state.indent, currentTruthyContext ? "" : "local ", id, " = ", expStr, ";\n");
	// }

	// const { length: stackSize } = stack;

	// for (
	// 	let i = 0, previous = stack[i], operand = stack[++i];
	// 	i < stackSize;
	// 	previous = operand, operand = stack[++i]
	// ) {
	// 	state.enterPrecedingStatementContext();
	// 	const checkStr = compileTruthyCheck(state, previous, id);
	// 	const checkContext = state.exitPrecedingStatementContext();

	// 	results.push(
	// 		state.indent,
	// 		"if ",
	// 		isAnd ? checkStr : checkStr === id ? `not ${checkStr}` : `not (${checkStr})`,
	// 		" then\n",
	// 	);
	// 	state.pushIndent();
	// 	const operandStr = compileExpression(state, operand);
	// 	if (id !== operandStr) {
	// 		results.push(state.indent, id, " = ", operandStr, ";\n");
	// 	}
	// }

	for (let i = 0; i < closingEnds; i++) {
		state.popIndent();
		results.push(state.indent, "end;\n");
	}

	state.pushPrecedingStatements(node, results.join(""));
	if (state.topTruthyNode === node) {
		state.topTruthyNode = undefined;
		state.currentTruthyContext = "";
		state.hasTruthyContextBeenUsed = undefined;
	}
	return id;
}

function makeLogicalBinaryState(state: CompilerState, id = state.getNewId()) {
	return {
		id,
		isIdUnused: true as true | undefined,
		results: new Array<string>(),
		sets: 0,
	};
}

type LogicalBinaryState = ReturnType<typeof makeLogicalBinaryState>;

/** FIXME: Move this into compileTruthyCheck */
function wrapNot(isAnd: boolean, expStr: string) {
	return isAnd ? expStr : `not (${expStr})`;
}

/**
 * Moment of truthy >:)
 * We use declaration context here for the bottom-most nodes. It shouldn't interfere with other systems.
 */
function parseNestedExpressions(
	state: CompilerState,
	logicalState: LogicalBinaryState,
	{ exprs, isAnd }: NestedExpressions,
	isInTruthyCheck: boolean,
	depth = 0,
) {
	let sets = 0;
	const { length } = exprs;
	let ifStatements = 0;
	const lastIndex = exprs.length - 1;
	const { id } = logicalState;

	for (let i = 0; i < length; i++) {
		const { [i]: item } = exprs;

		// if (sets++) {
		// 	logicalState.results.push(isAnd ? " and " : " or ");
		// }

		if (isNestedExpressions(item)) {
			logicalState.results.push("(");
			parseNestedExpressions(state, logicalState, item, isInTruthyCheck, depth + 1);
			logicalState.results.push(")");
		} else {
			/*
			If it is a truthy check, we want to set the id to compileTruthyCheck
			If it is not a truthy check, we want to set id to the compiledExpression, if the previous evaluates to truthy

			Let's define expStr as the expression to set `id`
			*/

			state.enterPrecedingStatementContext();

			let expStr = compileExpression(state, item);

			if (i === lastIndex) {
				state.pushPrecedingStatements(
					item,
					...state.exitPrecedingStatementContext(),
					state.indent,
					id,
					" = ",
					expStr,
					";\n",
				);

				for (let j = 0; j < ifStatements; j++) {
					state.popIndent();
					state.pushPrecedingStatements(item, state.indent, "end;\n");
				}
			} else {
				// handle the isIdUsed logic by switching to the declaration syntax.
				if (state.declarationContext.has(item)) {
					throw new CompilerError(
						"Attempted to set two declaration contexts.",
						item,
						CompilerErrorType.DeclarationBreak,
						true,
					);
				}

				state.declarationContext.set(item, {
					isIdentifier: false,
					needsLocalizing: logicalState.isIdUnused,
					set: id,
				});

				let checkStr = wrapNot(isAnd, compileTruthyCheck(state, item, expStr));

				if (!state.declarationContext.delete(item)) {
					logicalState.isIdUnused = undefined;
					logicalState.results = [id];
				}

				const context = state.exitPrecedingStatementContext();

				if (context.length > 0) {
					state.pushPrecedingStatements(item, ...context);
					state.pushPrecedingStatements(item, state.indent, "if ", checkStr, " then\n");
					ifStatements++;
					state.pushIndent();
				} else {
					logicalState.results.push(expStr);
				}
			}
		}
	}

	return logicalState;
}

export function compileLogicalBinary(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: boolean,
	node: ts.BinaryExpression,
) {
	if (!state.topTruthyNode) {
		state.topTruthyNode = node;
	}

	const isInTruthyCheck = isExpInTruthyCheck(node);

	if (isInTruthyCheck) {
		state.alreadyCheckedTruthyConditionals.push(skipNodesUpwardsLookAhead(node));
	}

	const nestedExpressions: NestedExpressions = { exprs: new Array(), isAnd };

	console.log(state.declarationContext.get(node));

	return parseNestedExpressions(
		state,
		makeLogicalBinaryState(state),
		preprocessLogicalBinary(state, lhs, rhs, isAnd ? 2 : 1, nestedExpressions),
		isInTruthyCheck,
	).results.join("");
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
	let checkNaN = isUnknown || isNonLiteralNumberTypeLax(expType);
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
	let checkLuaTruthy = isUnknown || isBoolishTypeLax(expType);
	let numRefs = 2 * +checkNaN + +checkNon0 + +checkEmptyString + +checkLuaTruthy;

	if (numRefs === 0) {
		numRefs = 1;
		checkLuaTruthy = true;
	}

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

	if (!isValidLuaIdentifier(expStr)) {
		if (numRefs > 1) {
			expStr = state.pushToDeclarationOrNewId(exp, expStr);
		} else if (shouldWrapExpression(exp, false)) {
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

	if (checkLuaTruthy) {
		checks.push(expStr);
	}

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

	return checks.join(" and ");
}
