import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
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
	depth = 0,
) {
	let i = 0;
	console.log("\t".repeat(depth), node.getText());
	// const { compileData: truthyData, exprs } = stuff;

	for (const side of [skipNodesDownwards(node.getLeft()), skipNodesDownwards(node.getRight())]) {
		i++;
		let compileData: TruthyCompileData;
		const isOpAndToken = getBinaryExpressionType(side);

		if (isOpAndToken) {
			console.log(
				"\t".repeat(depth),
				":",
				i,
				isOpAndToken === 2 ? "AND" : "OR",
				isOpAndToken === isAnd ? "" : "making new stuff",
			);
			if (isOpAndToken === isAnd) {
				({ compileData } = preprocessLogicalBinary(
					state,
					side as ts.BinaryExpression,
					isOpAndToken,
					stuff,
					depth + 1,
				));
			} else {
				const newStuff = ({ compileData } = preprocessLogicalBinary(
					state,
					side as ts.BinaryExpression,
					isOpAndToken,
					makeNestedExpressions(side, isOpAndToken === 2),
					depth + 1,
				));

				console.log(logNestedExpression(newStuff), "[::]");
				stuff.exprs.push(newStuff);
			}
		} else {
			compileData = getTruthyCompileData(state, side);
			console.log("\t".repeat(depth), "|", i, side.getText());
			stuff.exprs.push({ exp: side, compileData });
		}

		const { checkEmptyString, checkLuaTruthy, checkNaN, checkNon0 } = compileData;

		if (checkEmptyString) {
			stuff.compileData.checkEmptyString = checkEmptyString;
		}

		if (checkLuaTruthy) {
			stuff.compileData.checkLuaTruthy = checkLuaTruthy;
		}

		if (checkNaN) {
			stuff.compileData.checkNaN = checkNaN;
		}

		if (checkNon0) {
			stuff.compileData.checkNon0 = checkNon0;
		}
	}

	return stuff;
}

function makeLogicalBinaryState(state: CompilerState, id = state.getNewId()) {
	return {
		id,
		ifStatements: 0,
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
function evaluateNestedExpressions(
	state: CompilerState,
	logicalState: LogicalBinaryState,
	{ exprs, isAnd }: NestedExpressions,
	depth = 0,
) {
	const { length } = exprs;
	let ifStatements = 0;
	const lastIndex = exprs.length - 1;
	const { id } = logicalState;

	for (let i = 0; i < length; i++) {
		const { [i]: item } = exprs;
		const { compileData, exp } = item;

		if (isNestedExpressions(item)) {
			evaluateNestedExpressions(state, logicalState, item, depth + 1);
		} else {
			/*
				If it is a truthy check, we want to set the id to compileTruthyCheck
				If it is not a truthy check, we want to set id to the compiledExpression, if the previous evaluates to truthy

				Let's define expStr as the expression to set `id`
			*/

			state.enterPrecedingStatementContext();
			const expStr = compileExpression(state, exp);
			state.pushPrecedingStatements(exp, ...state.exitPrecedingStatementContext());

			let prefix = "";
			if (logicalState.isIdUnused) {
				logicalState.isIdUnused = undefined;
				prefix = "local ";
			}
			state.pushPrecedingStatements(exp, state.indent, prefix, id, " = ", expStr, ";\n");
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

	console.log(logNestedExpression({ exprs, isAnd }));
	while (ifStatements--) {
		state.popIndent();
		state.pushPrecedingStatements({} as ts.Node, state.indent, "end;\n");
	}

	return logicalState;
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
	console.log("___________");
	console.log(logNestedExpression(tree));

	return (isInTruthyCheck ? evaluateNestedCheckedExpressions : evaluateNestedExpressions)(
		state,
		makeLogicalBinaryState(state),
		tree,
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
	forcePush = false,
) {
	if (state.alreadyCheckedTruthyConditionals.includes(skipNodesUpwardsLookAhead(exp))) {
		return expStr;
	}

	const { checkNon0, checkNaN, checkEmptyString, checkLuaTruthy } = compileData;

	if (forcePush || !isValidLuaIdentifier(expStr)) {
		if (forcePush || getTruthyReferences(compileData) > 1) {
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
