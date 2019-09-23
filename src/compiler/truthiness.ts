import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards, skipNodesUpwardsLookAhead } from "../utility/general";
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
}

/** A basic AST-ish object into which we convert LogicalBinary expressions.
 * Easier to optimize than the default TS AST.
 */
interface NestedExpressions {
	exp: ts.Expression;
	exprs: Array<NestedExpression | NestedExpressions>;
	isAnd: boolean;
	compileData: TruthyCompileData;
}

function makeNestedExpressions(
	exp: ts.Expression,
	isAnd: boolean,
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
	};
}

function isNestedExpressions(x: NestedExpression | NestedExpressions): x is NestedExpressions {
	return "exprs" in x && "isAnd" in x;
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
		exprs: exprs.map(a => {
			if (isNestedExpressions(a)) {
				return "[" + logNestedExpression(a).exprs.join(", ") + "]";
			} else {
				return a.exp.getText();
			}
		}),
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
				const newExp = ({ compileData } = makeNestedExpressions(side, isOpAndToken === 2));
				preprocessLogicalBinary(state, side as ts.BinaryExpression, isOpAndToken, newExp);
				exprs.push(newExp);
			}
		} else {
			compileData = getTruthyCompileData(state, side);
			state.enterPrecedingStatementContext();
			const expStr = compileExpression(state, side);
			const context = state.exitPrecedingStatementContext();
			exprs.push({ exp: side, compileData, expStr, context });
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

function makeLogicalBinaryState(state: CompilerState, id = state.getNewId()) {
	return {
		id,
		isIdUnused: true as true | undefined,
		results: new Array<string>(),
	};
}

type LogicalBinaryState = ReturnType<typeof makeLogicalBinaryState>;

/** FIXME: Move this into compileTruthyCheck */
function wrapNot(isAnd: boolean, expStr: string) {
	return isAnd ? expStr : `not (${expStr})`;
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

/**
 * Moment of truthy >:)
 * We use declaration context here for the bottom-most nodes. It shouldn't interfere with other systems.
 */
function evaluateNestedExpressions(
	state: CompilerState,
	logicalState: LogicalBinaryState,
	nestedExpressions: NestedExpressions,
) {
	const { id } = logicalState;
	const stack: Array<[number, NestedExpressions]> = [[0, nestedExpressions]];
	let top = stack.pop();

	while (top) {
		console.log("START", top[0], logNestedExpression(top[1]));
		const [, { exprs, isAnd }] = top;
		let [i] = top;
		let ifStatements = 0;

		while (true) {
			if (i < exprs.length) {
				const { [i]: item } = exprs;
				const { compileData, exp } = item;
				if (isNestedExpressions(item)) {
					top[0] = i + 1;
					stack.push(top, [0, item]);
					break;
				} else {
					const { expStr, context } = item;

					let prefix = "";
					if (logicalState.isIdUnused) {
						logicalState.isIdUnused = undefined;
						prefix = "local ";
					}

					let expStrs = [expStr];

					// while (i + 1 < length) {
					// 	const { [i]: subItem } = exprs;
					// 	if (isNestedExpressions(subItem)) {
					// 		// console.log(
					// 		// 	logNestedExpression(subItem),
					// 		// 	subItem.exprs.every(a => isNestedExpressionCollapsable(a as NestedExpression)),
					// 		// );
					// 		// if (isNestedExpressionsCollapsable(subItem)) {
					// 		// 	console.log("COLLAPSABLE");
					// 		// 	expStrs = [
					// 		// 		`(${expStrs.join(isAnd ? " and " : " or ")})`,
					// 		// 		...collapseNestedExpressions(subItem),
					// 		// 	];
					// 		// } else {
					// 		break;
					// 		// }
					// 	} else if (isNestedExpressionCollapsable(subItem)) {
					// 		expStrs.push(subItem.expStr);
					// 		++i;
					// 	} else {
					// 		break;
					// 	}
					// }

					state.pushPrecedingStatements(
						exp,
						...context,
						state.indent,
						prefix,
						id,
						" = ",
						expStrs.join(isAnd ? " and " : " or "),
						";\n",
					);

					state.enterPrecedingStatementContext();
					const checkStr = wrapNot(isAnd!, compileTruthyCheck(state, exp, id, compileData));
					state.pushPrecedingStatements(exp, ...state.exitPrecedingStatementContext());
					state.pushPrecedingStatements(exp, state.indent, "if ", checkStr, " then\n");
					ifStatements++;
					state.pushIndent();
				}

				i++;
			} else {
				console.log("POPPING", i, ifStatements, top[0], logNestedExpression(top[1]));
				while (ifStatements--) {
					state.popIndent();
					state.pushPrecedingStatements(top[1].exp, state.indent, "end;\n");
				}
				break;
			}
		}

		top = stack.pop();

		if (top) {
			// console.log("END", top[0], logNestedExpression(top[1]));
		}
	}
}
/**
 * Moment of truthy >:)
 * We use declaration context here for the bottom-most nodes. It shouldn't interfere with other systems.
 */
function evaluateNestedExpressions2(
	state: CompilerState,
	logicalState: LogicalBinaryState,
	{ exprs, isAnd, exp: node }: NestedExpressions,
) {
	const { id } = logicalState;
	const { length } = exprs;
	const lastIndex = length - 1;
	let ifStatements = 0;

	for (let i = 0; i < length; i++) {
		const { [i]: item } = exprs;
		const { compileData, exp } = item;

		if (isNestedExpressions(item)) {
			evaluateNestedExpressions(state, logicalState, item);
		} else {
			const { expStr, context } = item;

			let prefix = "";
			if (logicalState.isIdUnused) {
				logicalState.isIdUnused = undefined;
				prefix = "local ";
			}

			let expStrs = [expStr];

			// while (i + 1 < length) {
			// 	const { [i]: subItem } = exprs;
			// 	if (isNestedExpressions(subItem)) {
			// 		// console.log(
			// 		// 	logNestedExpression(subItem),
			// 		// 	subItem.exprs.every(a => isNestedExpressionCollapsable(a as NestedExpression)),
			// 		// );
			// 		// if (isNestedExpressionsCollapsable(subItem)) {
			// 		// 	console.log("COLLAPSABLE");
			// 		// 	expStrs = [
			// 		// 		`(${expStrs.join(isAnd ? " and " : " or ")})`,
			// 		// 		...collapseNestedExpressions(subItem),
			// 		// 	];
			// 		// } else {
			// 		break;
			// 		// }
			// 	} else if (isNestedExpressionCollapsable(subItem)) {
			// 		expStrs.push(subItem.expStr);
			// 		++i;
			// 	} else {
			// 		break;
			// 	}
			// }

			state.pushPrecedingStatements(
				exp,
				...context,
				state.indent,
				prefix,
				id,
				" = ",
				expStrs.join(isAnd ? " and " : " or "),
				";\n",
			);
		}

		if (i !== lastIndex) {
			state.enterPrecedingStatementContext();
			const checkStr = wrapNot(isAnd!, compileTruthyCheck(state, exp, id, compileData));
			state.pushPrecedingStatements(exp, ...state.exitPrecedingStatementContext());
			state.pushPrecedingStatements(exp, state.indent, "if ", checkStr, " then\n");
			ifStatements++;
			state.pushIndent();
		}
	}

	while (ifStatements--) {
		state.popIndent();
		state.pushPrecedingStatements(node, state.indent, "end;\n");
	}

	return logicalState.id;
}

/*
state.declarationContext.set(exp, {
	isIdentifier: false,
	needsLocalizing: logicalState.isIdUnused,
	set: id,
});
*/

const evaluateNestedCheckedExpressions = evaluateNestedExpressions;

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

	return (isInTruthyCheck ? evaluateNestedCheckedExpressions : evaluateNestedExpressions)(
		state,
		makeLogicalBinaryState(state),
		tree,
	);
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
