import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { joinIndentedLines, skipNodesDownwards, skipNodesUpwardsLookAhead } from "../utility/general";
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

/** Returns whether a given node needs to preserve its value as a truthiness statement.
 * If it is within an if statement, for example, we can throw away in between values. See docs below.
 * However, it is also possible for expressions within an if statement to require the proper value.
 * So we just whitelist the nodes we can safely climb and optimize those.
 * @example
 * if ((x = f()) && g()) {} // everything in the rhs of `x = ` can't be optimized
 */
export function isExpInTruthyCheck(node: ts.Node) {
	const previous =
		node.getParentWhile((p, n) => {
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

type TruthyCompileData = ReturnType<typeof getTruthyCompileData>;

interface NestedExpression {
	exp: ts.Expression;
	compileData: TruthyCompileData;
	expStr: string;
	context: PrecedingStatementContext;
	isMeta: false;
}

/** A basic AST-ish object into which we convert LogicalBinary expressions.
 * Easier to optimize than the default TS AST.
 */
interface NestedExpressions {
	exp: ts.Expression;
	exprs: Array<NestedExpression | NestedExpressions>;
	isAnd: boolean;
	compileData: TruthyCompileData;
	isMeta: true;
	parent: NestedExpressions | undefined;
}

function makeNestedExpressions(
	exp: ts.Expression,
	isAnd: boolean,
	parent?: NestedExpressions,
	compileData: TruthyCompileData = {
		checkEmptyString: false,
		checkLuaTruthy: false,
		checkNaN: false,
		checkNon0: false,
	},
): NestedExpressions {
	return {
		compileData,
		exp,
		exprs: new Array(),
		isAnd,
		isMeta: true,
		parent,
	};
}

function isNestedExpressions(x: NestedExpression | NestedExpressions): x is NestedExpressions {
	return x.isMeta;
}

function logNestedExpression({
	exprs,
	isAnd,
}: Pick<NestedExpressions, "exprs" | "isAnd">): {
	exprs: Array<string>;
	isAnd: boolean;
} {
	return {
		// compileData,
		exprs: exprs.map(a => (a.isMeta ? "[" + logNestedExpression(a).exprs.join(", ") + "]" : a.exp.getText())),
		isAnd,
	};
}

function getTruthyReferences({ checkEmptyString, checkLuaTruthy, checkNaN, checkNon0 }: TruthyCompileData) {
	return 2 * +checkNaN + +checkNon0 + +checkEmptyString + +checkLuaTruthy;
}

/**
 * Preprocesses a logical binary part of the AST and converts it to a more friendly format we can optimize easier.
 * Turns it into a `NestedExpressions` object.
 */
export function preprocessLogicalBinary(
	state: CompilerState,
	node: ts.BinaryExpression,
	isAnd: 1 | 2,
	stuff: NestedExpressions,
) {
	const { exprs, compileData: truthyData } = stuff;

	for (const side of [skipNodesDownwards(node.getLeft()), skipNodesDownwards(node.getRight())]) {
		let compileData: TruthyCompileData | undefined;
		const isOpAndToken = getBinaryExpressionType(side);

		if (isOpAndToken) {
			if (isOpAndToken === isAnd) {
				preprocessLogicalBinary(state, side as ts.BinaryExpression, isOpAndToken, stuff);
			} else {
				const newExp = ({ compileData } = makeNestedExpressions(side, isOpAndToken === 2, stuff));
				preprocessLogicalBinary(state, side as ts.BinaryExpression, isOpAndToken, newExp);
				exprs.push(newExp);
			}
		} else {
			compileData = getTruthyCompileData(state, side);
			state.enterPrecedingStatementContext();
			const expStr = compileExpression(state, side);
			const context = state.exitPrecedingStatementContext();
			exprs.push({ exp: side, compileData, expStr, context, isMeta: false });
		}

		if (compileData) {
			const { checkEmptyString, checkLuaTruthy, checkNaN, checkNon0 } = compileData;

			if (checkEmptyString) {
				truthyData.checkEmptyString = checkEmptyString;
			}

			if (checkLuaTruthy) {
				truthyData.checkLuaTruthy = checkLuaTruthy;
			}

			if (checkNaN) {
				truthyData.checkNaN = checkNaN;
			}

			if (checkNon0) {
				truthyData.checkNon0 = checkNon0;
			}
		}
	}
}

function makeLogicalBinaryState(state: CompilerState, nestedExp: NestedExpressions, id = state.getNewId()) {
	return {
		id,
		ifs: 0,
		inlineCompiling: false,
		isIdUnused: true as true | undefined,
		results: new Array<string>(),
		state: new Map<NestedExpressions, { expStrs: Array<string>; i: number; ifs: number }>([
			[nestedExp, { expStrs: [], i: 0, ifs: 0 }],
		]),
	};
}

type LogicalBinaryState = ReturnType<typeof makeLogicalBinaryState>;

/** FIXME: Move this into compileTruthyCheck */
function wrapNot(isAnd: boolean, expStr: string) {
	return isAnd ? expStr : isValidLuaIdentifier(expStr) ? `not ${expStr}` : `not (${expStr})`;
}

function isNestedExpressionCollapsable({ expStr, context, compileData }: NestedExpression): boolean {
	// console.log(expStr, context.length === 0, compileData.checkLuaTruthy, getTruthyReferences(compileData) === 1);
	return context.length === 0 && compileData.checkLuaTruthy && getTruthyReferences(compileData) === 1;
}

function isNestedExpressionsCollapsable(item: NestedExpressions): boolean {
	return item.exprs.every(expr =>
		isNestedExpressions(expr) ? isNestedExpressionsCollapsable(expr) : isNestedExpressionCollapsable(expr),
	);
}

function collapseNestedExpressions(item: NestedExpressions): Array<string> {
	return item.exprs.map(exp =>
		isNestedExpressions(exp)
			? "(" + collapseNestedExpressions(exp).join(item.isAnd ? " and " : " or ") + ")"
			: exp.expStr,
	);
}

function expandBoolExp(subItem: NestedExpression | NestedExpressions): string {
	return subItem.isMeta
		? `(${subItem.exprs.map(expandBoolExp).join(subItem.isAnd ? " and " : " or ")})`
		: subItem.expStr;
}

function isCompileDataBooly(compileData: TruthyCompileData) {
	return (
		compileData.checkLuaTruthy && !compileData.checkEmptyString && !compileData.checkNaN && !compileData.checkNon0
	);
}

const getFirst = ({ exprs: { [0]: exp } }: NestedExpressions): NestedExpression => (exp.isMeta ? getFirst(exp) : exp);
const getLast = ({ exprs: { length, [length - 1]: exp } }: NestedExpressions): NestedExpression =>
	exp.isMeta ? getLast(exp) : exp;

function canShorten(
	subItem: NestedExpression | NestedExpressions,
	last = subItem.isMeta ? getLast(subItem) : subItem,
): boolean {
	return subItem.isMeta
		? subItem.exprs.every(item => canShorten(item, last))
		: subItem.context.length === 0 && (subItem === last || isCompileDataBooly(subItem.compileData));
}

function shorten(subItem: NestedExpression | NestedExpressions): string {
	return subItem.isMeta
		? "(" +
				subItem.exprs
					.reduce((a, c) => {
						a.push(shorten(c));
						return a;
					}, new Array<string>())
					.join(subItem.isAnd ? " and " : " or ") +
				")"
		: subItem.expStr;
}

function getLast2({ [length - 1]: item }: Array<string>) {
	return item;
}

function appendBoolyNestedExpressionsHelper(
	logicalState: LogicalBinaryState,
	expStrs: Array<string>,
	item: NestedExpression | NestedExpressions,
	compileData: TruthyCompileData,
): boolean {
	if (item.isMeta) {
		for (const subItem of item.exprs) {
			if (!appendBoolyNestedExpressionsHelper(logicalState, expStrs, subItem, compileData)) {
				return false;
			}
		}

		return true;
	} else {
		const shouldPush = isCompileDataBooly(compileData) && item.context.length === 0;

		if (isCompileDataBooly(compileData) && item.context.length === 0) {
			expStrs.push(item.expStr);
		}

		return shouldPush;
	}
}

function appendBoolyNestedExpressions(logicalState: LogicalBinaryState, top: NestedExpressions) {
	let parent = top;
	let state: NonNullable<ReturnType<typeof logicalState.state["get"]>>;
	let item: NestedExpression | undefined;

	do {
		// Iterate through a given parent in order:
		// if it comes across a NestedExpressions, enter inside that one.
		// if it comes across a NestedExpression, set the current item to that one.
		// if it comes to the last element of a NestedExpressions, re-enter the parent context.
		// (at the location of the NestedExpressions)
		while (true) {
			state = logicalState.state.get(parent)!;
			const i = state.i++;
			console.log(i, i < parent.exprs.length, logNestedExpression(parent));
			if (i < parent.exprs.length) {
				const subItem = parent.exprs[i];

				if (subItem.isMeta) {
					item = undefined;

					if (!logicalState.state.has(subItem)) {
						logicalState.state.set(subItem, { i: 0, expStrs: [], ifs: 0 });
					}
					// expStrs = [expStrs.length ? "(" + expStrs.join(parent.isAnd ? " and " : " or ") + ")" : expStrs[0]];
					parent = subItem;
				} else {
					item = subItem;
					break;
				}
			} else {
				item = undefined;
				const { parent: next } = parent;

				if (next) {
					const expStrValue =
						state.expStrs.length > 0
							? "(" + state.expStrs.join(parent.isAnd ? " and " : " or ") + ")"
							: state.expStrs[0];
					const nextState = logicalState.state.get(next);

					console.log(expStrValue, nextState);

					if (nextState) {
						nextState.expStrs.push(expStrValue);
					} else {
						logicalState.state.set(next, {
							expStrs: [expStrValue],
							i: next.exprs.indexOf(parent) + 1,
							ifs: 0,
						});
					}
					parent = next;
				} else {
					break;
				}
			}
		}

		if (item && item.context.length === 0) {
			console.log(item.expStr);
			state.expStrs.push(item.expStr);
		} else {
			break;
		}
	} while (isCompileDataBooly(item.compileData));

	--state.i;

	while (parent && parent !== top && parent.parent) {
		const next = parent.parent;
		const nextState = logicalState.state.get(next) || { i: next.exprs.indexOf(parent) + 1, expStrs: [], ifs: 0 };
		const expStrValue =
			state.expStrs.length > 0
				? "(" + state.expStrs.join(parent.isAnd ? " and " : " or ") + ")"
				: state.expStrs[0];

		console.log("STATE", state, expStrValue, logNestedExpression(parent));
		state.expStrs = [];
		--nextState.i;
		nextState.expStrs.push(expStrValue);
		parent = next;
		state = nextState;
	}
	console.log("STATE", state, logNestedExpression(parent));
}

function getPrevious(nestedExpressions: NestedExpressions, i: number): NestedExpression | undefined {
	if (0 <= i) {
		const item = nestedExpressions.exprs[i];
		return item.isMeta ? getPrevious(item, item.exprs.length - 1) : item;
	} else {
		const { parent } = nestedExpressions;
		if (parent) {
			return getPrevious(parent, parent.exprs.indexOf(nestedExpressions) - 1);
		}
	}
}

function getNext(nestedExpressions: NestedExpressions, i: number): NestedExpression | undefined {
	if (i < nestedExpressions.exprs.length) {
		const item = nestedExpressions.exprs[i];
		return item.isMeta ? getNext(item, 0) : item;
	} else {
		const { parent } = nestedExpressions;
		if (parent) {
			return getNext(parent, parent.exprs.indexOf(nestedExpressions) + 1);
		}
	}
}

function evaluateNestedExpressions9(
	state: CompilerState,
	logicalState: LogicalBinaryState,
	nestedExpressions: NestedExpressions,
) {
	const stack = new Array<NestedExpressions>();
	let iterState = logicalState.state.get(nestedExpressions)!;

	while (true) {
		if (iterState.i < nestedExpressions.exprs.length) {
			const { [iterState.i++]: item } = nestedExpressions.exprs;

			console.log(iterState.i, item.isMeta ? logNestedExpression(item) : item.expStr);

			if (item.isMeta) {
				stack.push(nestedExpressions);
				logicalState.state.set((nestedExpressions = item), (iterState = { i: 0, expStrs: [], ifs: 0 }));
			} else {
				iterState.expStrs.push(item.expStr);

				let prefix = "";
				if (logicalState.isIdUnused) {
					logicalState.isIdUnused = undefined;
					prefix = "local ";
				}

				state.pushPrecedingStatements(
					item.exp,
					joinIndentedLines(item.context, logicalState.ifs),
					state.indent,
					prefix,
					logicalState.id,
					" = ",
					iterState.expStrs.join(nestedExpressions.isAnd ? " and " : " or "),
					";\n",
				);

				iterState.expStrs = [];

				if (iterState.i < nestedExpressions.exprs.length) {
					const checkStr = wrapNot(
						nestedExpressions.isAnd,
						compileTruthyCheck(state, item.exp, logicalState.id, item.compileData),
					);
					state.pushPrecedingStatements(item.exp, state.indent, "if ", checkStr, " then\n");
					state.pushIndent();
					iterState.ifs++;
					logicalState.ifs++;
				}
			}
		} else {
			while (iterState.ifs--) {
				logicalState.ifs--;
				state.popIndent();
				state.pushPrecedingStatements(nestedExpressions.exp, state.indent, "end;\n");
			}

			const popped = stack.pop();
			console.log("POPPIN", popped ? logNestedExpression(popped) : popped);

			if (popped) {
				nestedExpressions = popped;
				iterState = logicalState.state.get(nestedExpressions)!;

				if (iterState.i < nestedExpressions.exprs.length) {
					const checkStr = wrapNot(
						nestedExpressions.isAnd,
						compileTruthyCheck(
							state,
							nestedExpressions.exp,
							logicalState.id,
							nestedExpressions.compileData,
						),
					);
					state.pushPrecedingStatements(nestedExpressions.exp, state.indent, "if ", checkStr, " then\n");
					state.pushIndent();
					iterState.ifs++;
					logicalState.ifs++;
				}
			} else {
				break;
			}
		}
	}
}

/**
 * Moment of truthy >:)
 * Not perfect, but it works. We can make a better implementation for the intermediary AST version.
 */
function evaluateNestedExpressions(
	state: CompilerState,
	logicalState: LogicalBinaryState,
	nestedExpressions: NestedExpressions,
) {
	let i = 0;
	/** The object in which we store our operands for and/or selections */
	let expStrs = new Array<string>();
	let ifs = 0;

	// iterate through all nestedExpressions
	while (i < nestedExpressions.exprs.length) {
		let { [i++]: item } = nestedExpressions.exprs;
		let { compileData } = item;
		const firstItem = item;

		// if it is a group, try to shorten it. If it can't be shortened, evaluate recursively.
		if (item.isMeta) {
			if (canShorten(item)) {
				expStrs.push(shorten(item));
			} else {
				evaluateNestedExpressions(state, logicalState, item);
			}
		} else {
			expStrs.push(item.expStr);
		}

		while (i < nestedExpressions.exprs.length && isCompileDataBooly(compileData)) {
			const { [i]: next } = nestedExpressions.exprs;
			if (canShorten(next)) {
				expStrs.push(shorten(next));
				i++;
				item = { compileData } = next;
			} else {
				break;
			}
		}

		if (expStrs.length) {
			if (!logicalState.isIdUnused && firstItem.isMeta) {
				const checkStr = wrapNot(
					nestedExpressions.isAnd,
					compileTruthyCheck(state, item.exp, logicalState.id, firstItem.compileData),
				);
				state.pushPrecedingStatements(item.exp, state.indent, "if ", checkStr, " then\n");
				state.pushIndent();
				ifs++;
				logicalState.ifs++;
			}

			let prefix = "";
			if (logicalState.isIdUnused) {
				logicalState.isIdUnused = undefined;
				prefix = "local ";
			}

			state.pushPrecedingStatements(
				item.exp,
				firstItem.isMeta ? "" : joinIndentedLines(firstItem.context, logicalState.ifs),
				state.indent,
				prefix,
				logicalState.id,
				" = ",
				expStrs.join(nestedExpressions.isAnd ? " and " : " or "),
				";\n",
			);

			expStrs = [];
		}

		// if there will be items to follow, open up this if statement
		if (i < nestedExpressions.exprs.length) {
			console.log(item.isMeta ? logNestedExpression(item) : item.expStr, compileData);
			const checkStr = wrapNot(
				nestedExpressions.isAnd,
				compileTruthyCheck(state, item.exp, logicalState.id, compileData),
			);
			state.pushPrecedingStatements(item.exp, state.indent, "if ", checkStr, " then\n");
			state.pushIndent();
			ifs++;
			logicalState.ifs++;
		}
	}

	while (ifs--) {
		logicalState.ifs--;
		state.popIndent();
		state.pushPrecedingStatements(nestedExpressions.exp, state.indent, "end;\n");
	}

	return logicalState.id;
}

// const evaluateNestedCheckedExpressions = evaluateNestedExpressions;

function evaluateNestedCheckedExpressions(
	state: CompilerState,
	logicalState: LogicalBinaryState,
	nestedExpressions: NestedExpressions,
	first = getLast,
) {
	const expStrs = new Array<string>();
	for (const expr of nestedExpressions.exprs) {
		if (expr.isMeta) {
			evaluateNestedCheckedExpressions(state, logicalState, expr);
		} else {
			const check = compileTruthyCheck(state, expr.exp, expr.expStr, expr.compileData);

			if (
				(first === expr || expr.context.length === 0) &&
				(isValidLuaIdentifier(expr.expStr) || getTruthyReferences(expr.compileData) === 1)
			) {
				expStrs.push(check);
			} else {
				expStrs.push(check);
			}
		}
	}

	return expStrs.join(nestedExpressions.isAnd ? " and " : " or ");
}

/**
 * Moment of truthy >:)
 * Not perfect, but it works. We can make a better implementation for the intermediary AST version.
 */
// function evaluateNestedCheckedExpressions(
// 	state: CompilerState,
// 	logicalState: LogicalBinaryState,
// 	nestedExpressions: NestedExpressions,
// ) {
// 	let i = 0;
// 	/** The object in which we store our operands for and/or selections */
// 	let expStrs = new Array<string>();
// 	let ifs = 0;

// 	// iterate through all nestedExpressions
// 	while (i < nestedExpressions.exprs.length) {
// 		let { [i++]: item } = nestedExpressions.exprs;
// 		let { compileData } = item;
// 		const firstItem = item;

// 		// if it is a group, try to shorten it. If it can't be shortened, evaluate recursively.
// 		if (item.isMeta) {
// 			if (canShorten(item)) {
// 				expStrs.push(shorten(item));
// 			} else {
// 				evaluateNestedExpressions(state, logicalState, item);
// 			}
// 		} else {
// 			expStrs.push(item.expStr);
// 		}

// 		while (i < nestedExpressions.exprs.length && isCompileDataBooly(compileData)) {
// 			const { [i]: next } = nestedExpressions.exprs;
// 			if (canShorten(next)) {
// 				expStrs.push(shorten(next));
// 				i++;
// 				item = { compileData } = next;
// 			} else {
// 				break;
// 			}
// 		}

// 		if (expStrs.length) {
// 			if (!logicalState.isIdUnused && firstItem.isMeta) {
// 				const checkStr = wrapNot(
// 					nestedExpressions.isAnd,
// 					compileTruthyCheck(state, item.exp, logicalState.id, compileData),
// 				);
// 				state.pushPrecedingStatements(item.exp, state.indent, "if ", checkStr, " then\n");
// 				state.pushIndent();
// 				ifs++;
// 				logicalState.ifs++;
// 			}

// 			let prefix = "";
// 			if (logicalState.isIdUnused) {
// 				logicalState.isIdUnused = undefined;
// 				prefix = "local ";
// 			}

// 			state.pushPrecedingStatements(
// 				item.exp,
// 				firstItem.isMeta ? "" : joinIndentedLines(firstItem.context, logicalState.ifs),
// 				state.indent,
// 				prefix,
// 				logicalState.id,
// 				" = ",
// 				expStrs.join(nestedExpressions.isAnd ? " and " : " or "),
// 				";\n",
// 			);

// 			expStrs = [];
// 		}

// 		// if there will be items to follow, open up this if statement
// 		if (i < nestedExpressions.exprs.length) {
// 			const checkStr = wrapNot(
// 				nestedExpressions.isAnd,
// 				compileTruthyCheck(state, item.exp, logicalState.id, firstItem. compileData),
// 			);
// 			state.pushPrecedingStatements(item.exp, state.indent, "if ", checkStr, " then\n");
// 			state.pushIndent();
// 			ifs++;
// 			logicalState.ifs++;
// 		}
// 	}

// 	while (ifs--) {
// 		logicalState.ifs--;
// 		state.popIndent();
// 		state.pushPrecedingStatements(nestedExpressions.exp, state.indent, "end;\n");
// 	}
// }
/*
state.declarationContext.set(exp, {
	isIdentifier: false,
	needsLocalizing: logicalState.isIdUnused,
	set: id,
});
*/

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

	const tree = makeNestedExpressions(node, isAnd);
	preprocessLogicalBinary(state, node, isAnd ? 2 : 1, tree);
	console.log(logNestedExpression(tree));
	const logicalState = makeLogicalBinaryState(state, tree);
	return (isInTruthyCheck ? evaluateNestedCheckedExpressions : evaluateNestedExpressions)(state, logicalState, tree);
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
	const checkLuaTruthy =
		isUnknown ||
		ts.TypeGuards.isYieldExpression(exp) ||
		isBoolishTypeLax(expType) ||
		(!checkNaN && !checkNon0 && !checkEmptyString);

	return { checkNon0, checkNaN, checkEmptyString, checkLuaTruthy };
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

	const { checkNon0, checkNaN, checkEmptyString, checkLuaTruthy } = compileData;

	if (!isValidLuaIdentifier(expStr)) {
		if (getTruthyReferences(compileData) > 1) {
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
