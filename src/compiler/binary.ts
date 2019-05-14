import * as ts from "ts-morph";
import { checkNonAny, compileCallExpression, compileExpression, concatNamesAndValues, getBindingData } from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { isNumberType, isStringType, isTupleReturnTypeCall, shouldPushToPrecedingStatement } from "../typeUtilities";
import { getNonNullExpression, getNonNullUnParenthesizedExpression } from "../utility";
import { getAccessorForBindingPatternType } from "./binding";
import { isIdentifierDefinedInExportLet } from "./indexed";

function getLuaBarExpression(state: CompilerState, node: ts.BinaryExpression, lhsStr: string, rhsStr: string) {
	state.usesTSLibrary = true;
	const rhs = node.getRight();
	if (ts.TypeGuards.isNumericLiteral(rhs) && rhs.getLiteralValue() === 0) {
		return `TS.bit_truncate(${lhsStr})`;
	} else {
		return `TS.bit_or(${lhsStr}, ${rhsStr})`;
	}
}

function getLuaBitExpression(state: CompilerState, lhsStr: string, rhsStr: string, name: string) {
	state.usesTSLibrary = true;
	return `TS.bit_${name}(${lhsStr}, ${rhsStr})`;
}

function getLuaAddExpression(node: ts.BinaryExpression, lhsStr: string, rhsStr: string, wrap = false) {
	if (wrap) {
		rhsStr = `(${rhsStr})`;
	}
	const leftType = node.getLeft().getType();
	const rightType = node.getRight().getType();

	/* istanbul ignore else */
	if (isStringType(leftType) || isStringType(rightType)) {
		return `(${lhsStr}) .. ${rhsStr}`;
	} else if (isNumberType(leftType) && isNumberType(rightType)) {
		return `${lhsStr} + ${rhsStr}`;
	} else {
		/* istanbul ignore next */
		throw new CompilerError(
			`Unexpected types for addition: ${leftType.getText()} + ${rightType.getText()}`,
			node,
			CompilerErrorType.BadAddition,
		);
	}
}

export function isSetToken(opKind: ts.ts.SyntaxKind) {
	return (
		opKind === ts.SyntaxKind.EqualsToken ||
		opKind === ts.SyntaxKind.BarEqualsToken ||
		opKind === ts.SyntaxKind.AmpersandEqualsToken ||
		opKind === ts.SyntaxKind.CaretEqualsToken ||
		opKind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
		opKind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
		opKind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
		opKind === ts.SyntaxKind.PlusEqualsToken ||
		opKind === ts.SyntaxKind.MinusEqualsToken ||
		opKind === ts.SyntaxKind.AsteriskEqualsToken ||
		opKind === ts.SyntaxKind.SlashEqualsToken ||
		opKind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
		opKind === ts.SyntaxKind.PercentEqualsToken
	);
}

function compileBinaryLiteral(
	state: CompilerState,
	node: ts.BinaryExpression,
	lhs: ts.ObjectLiteralExpression | ts.ArrayLiteralExpression,
	rhs: ts.Expression,
) {
	const names = new Array<string>();
	const values = new Array<string>();
	const preStatements = new Array<string>();
	const postStatements = new Array<string>();

	let rootId: string;
	if (ts.TypeGuards.isIdentifier(rhs)) {
		rootId = compileExpression(state, rhs);
	} else {
		rootId = state.getNewId();
		preStatements.push(`local ${rootId} = ${compileExpression(state, rhs)};`);
	}

	getBindingData(
		state,
		names,
		values,
		preStatements,
		postStatements,
		lhs,
		rootId,
		getAccessorForBindingPatternType(rhs),
	);

	const parent = getNonNullUnParenthesizedExpression(node.getParentOrThrow());

	if (ts.TypeGuards.isExpressionStatement(parent) || ts.TypeGuards.isForStatement(parent)) {
		let result = "";
		preStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
		concatNamesAndValues(state, names, values, false, declaration => (result += declaration));
		postStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
		return result.replace(/;\n$/, ""); // terrible hack
	} else {
		preStatements.forEach(statementStr => state.pushPrecedingStatements(rhs, state.indent + statementStr + "\n"));
		concatNamesAndValues(state, names, values, false, declaration =>
			state.pushPrecedingStatements(node, declaration),
		);
		postStatements.forEach(statementStr => state.pushPrecedingStatements(lhs, state.indent + statementStr + "\n"));
		return rootId;
	}
}

export function compileBinaryExpression(state: CompilerState, node: ts.BinaryExpression) {
	const opToken = node.getOperatorToken();
	const opKind = opToken.getKind();
	const isEqualsOperation = opKind === ts.SyntaxKind.EqualsToken;

	const lhs = node.getLeft();
	const rhs = getNonNullExpression(node.getRight());
	let lhsStr: string;
	let rhsStr: string;

	if (!isEqualsOperation) {
		checkNonAny(lhs);
		checkNonAny(rhs);
	}

	// binding patterns
	if (ts.TypeGuards.isArrayLiteralExpression(lhs)) {
		const isFlatBinding = lhs
			.getElements()
			.filter(v => ts.TypeGuards.isBindingElement(v))
			.every(v => ts.TypeGuards.isIdentifier(v.getChildAtIndex(0)));

		if (isFlatBinding && rhs && ts.TypeGuards.isCallExpression(rhs) && isTupleReturnTypeCall(rhs)) {
			// FIXME: Still broken for nested destructuring of non-arrays.
			// BUT this change makes it LESS broken than before. (try nested destructuring a string here)
			// e.g. [[[[[[[a]]]]]]] = func() where func() returns a LuaTuple<[string]>

			let result = "";
			const preStatements = new Array<string>();
			const postStatements = new Array<string>();
			const names = lhs
				.getElements()
				.map(element => {
					if (ts.TypeGuards.isOmittedExpression(element)) {
						return "_";
					} else if (
						ts.TypeGuards.isArrayLiteralExpression(element) ||
						ts.TypeGuards.isObjectLiteralExpression(element)
					) {
						let rootId: string;
						rootId = state.getNewId();

						getBindingData(
							state,
							[],
							[],
							preStatements,
							postStatements,
							element,
							rootId,
							getAccessorForBindingPatternType(rhs),
						);
						return rootId;
					} else {
						console.log(element.getKindName(), element.getText());
						return compileExpression(state, element);
					}
				})
				.filter(s => s !== "");

			const values = [compileCallExpression(state, rhs, true)];
			concatNamesAndValues(
				state,
				names,
				values,
				false,
				declaration => (result += declaration + ";\n"),
				false,
				false,
			);
			preStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
			postStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
			if (ts.TypeGuards.isExpressionStatement(getNonNullUnParenthesizedExpression(node.getParent()))) {
				return result.replace(/;\n$/, ""); // terrible hack
			} else {
				throw new CompilerError(
					"Cannot use a LuaTuple destructuring expression outside an ExpressionStatement!",
					node,
					CompilerErrorType.BadLuaTupleStatement,
				);
			}
		} else {
			return compileBinaryLiteral(state, node, lhs, rhs);
		}
	} else if (ts.TypeGuards.isObjectLiteralExpression(lhs)) {
		return compileBinaryLiteral(state, node, lhs, rhs);
	}

	if (isSetToken(opKind)) {
		lhsStr = compileExpression(state, lhs);
		const isLhsIdentifier = ts.TypeGuards.isIdentifier(lhs) && !isIdentifierDefinedInExportLet(lhs);

		state.enterPrecedingStatementContext();
		let rhsPushedStr: string = "";
		let rhsStrContext: PrecedingStatementContext;
		let hasOpenContext = false;

		const parentKind = node.getParentOrThrow().getKind();
		const isStatement =
			parentKind === ts.SyntaxKind.ExpressionStatement || parentKind === ts.SyntaxKind.ForStatement;

		if (isEqualsOperation) {
			state.declarationContext.set(rhs, { isIdentifier: isLhsIdentifier, set: lhsStr });
			hasOpenContext = true;

			state.enterPrecedingStatementContext();
			rhsStr = compileExpression(state, rhs);
			const rhsSubContext = state.exitPrecedingStatementContext();
			const { isPushed } = rhsSubContext;

			if (isPushed) {
				rhsPushedStr = rhsStr;
			}

			if (state.declarationContext.delete(rhs)) {
				hasOpenContext = false;
			} else if (
				!isPushed &&
				!isStatement &&
				(!ts.TypeGuards.isIdentifier(lhs) || isIdentifierDefinedInExportLet(lhs))
			) {
				rhsPushedStr = rhsStr = state.pushPrecedingStatementToReuseableId(rhs, rhsStr);
			}

			state.pushPrecedingStatements(rhs, ...rhsSubContext);
		} else {
			rhsStr = compileExpression(state, rhs);
		}
		rhsStrContext = state.exitPrecedingStatementContext();

		let previouslhs: string;

		if (rhsStrContext.length > 0) {
			previouslhs = isEqualsOperation
				? ""
				: state.pushPrecedingStatementToReuseableId(lhs, lhsStr, rhsStrContext);

			state.pushPrecedingStatements(rhs, ...rhsStrContext);
		} else {
			previouslhs = lhsStr;
		}

		/* istanbul ignore else */
		if (opKind === ts.SyntaxKind.BarEqualsToken) {
			rhsStr = getLuaBarExpression(state, node, previouslhs, rhsStr);
		} else if (opKind === ts.SyntaxKind.AmpersandEqualsToken) {
			rhsStr = getLuaBitExpression(state, previouslhs, rhsStr, "and");
		} else if (opKind === ts.SyntaxKind.CaretEqualsToken) {
			rhsStr = getLuaBitExpression(state, previouslhs, rhsStr, "xor");
		} else if (opKind === ts.SyntaxKind.LessThanLessThanEqualsToken) {
			rhsStr = getLuaBitExpression(state, previouslhs, rhsStr, "lsh");
		} else if (opKind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken) {
			rhsStr = getLuaBitExpression(state, previouslhs, rhsStr, "rsh");
		} else if (opKind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken) {
			rhsStr = getLuaBitExpression(state, previouslhs, rhsStr, "lrsh");
		} else if (opKind === ts.SyntaxKind.PlusEqualsToken) {
			rhsStr = getLuaAddExpression(node, previouslhs, rhsStr, true);
		} else if (opKind === ts.SyntaxKind.MinusEqualsToken) {
			rhsStr = `${previouslhs} - (${rhsStr})`;
		} else if (opKind === ts.SyntaxKind.AsteriskEqualsToken) {
			rhsStr = `${previouslhs} * (${rhsStr})`;
		} else if (opKind === ts.SyntaxKind.SlashEqualsToken) {
			rhsStr = `${previouslhs} / (${rhsStr})`;
		} else if (opKind === ts.SyntaxKind.AsteriskAsteriskEqualsToken) {
			rhsStr = `${previouslhs} ^ (${rhsStr})`;
		} else if (opKind === ts.SyntaxKind.PercentEqualsToken) {
			rhsStr = `${previouslhs} % (${rhsStr})`;
		} else if (!isEqualsOperation) {
			throw new CompilerError(
				"You just discovered a new kind of BinaryExpression! (" +
					opToken.getText() +
					") Please submit an issue request at https://github.com/roblox-ts/roblox-ts/issues",
				opToken,
				CompilerErrorType.BadBinaryExpression,
			);
		}

		const unUsedStatement = !isEqualsOperation || !hasOpenContext;
		if (isStatement) {
			return unUsedStatement ? `${lhsStr} = ${rhsStr}` : "";
		} else {
			if (!isLhsIdentifier) {
				const newId = rhsPushedStr || state.pushToDeclarationOrNewId(node.getParent(), rhsStr);
				if (unUsedStatement) {
					state.pushPrecedingStatements(node, state.indent + `${lhsStr} = ${newId};\n`);
				}
				state.getCurrentPrecedingStatementContext(node).isPushed = true;
				return newId;
			} else {
				if (unUsedStatement) {
					state.pushPrecedingStatements(node, state.indent + `${lhsStr} = ${rhsStr};\n`);
				}

				return lhsStr;
			}
		}
	} else {
		state.enterPrecedingStatementContext();
		lhsStr = compileExpression(state, lhs);
		const lhsContext = state.exitPrecedingStatementContext();
		state.enterPrecedingStatementContext();
		rhsStr = compileExpression(state, rhs);
		const rhsContext = state.exitPrecedingStatementContext();

		state.pushPrecedingStatements(lhs, ...lhsContext);
		if (rhsContext.length > 0) {
			if (shouldPushToPrecedingStatement(lhs, lhsStr, lhsContext)) {
				lhsStr = state.pushPrecedingStatementToReuseableId(lhs, lhsStr, rhsContext);
			}
			state.pushPrecedingStatements(rhs, ...rhsContext);
		}
	}

	/* istanbul ignore else */
	if (opKind === ts.SyntaxKind.EqualsEqualsToken) {
		throw new CompilerError(
			"operator '==' is not supported! Use '===' instead.",
			opToken,
			CompilerErrorType.NoEqualsEquals,
		);
	} else if (opKind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
		return `${lhsStr} == ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.ExclamationEqualsToken) {
		throw new CompilerError(
			"operator '!=' is not supported! Use '!==' instead.",
			opToken,
			CompilerErrorType.NoExclamationEquals,
		);
	} else if (opKind === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
		return `${lhsStr} ~= ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.BarToken) {
		return getLuaBarExpression(state, node, lhsStr, rhsStr);
	} else if (opKind === ts.SyntaxKind.AmpersandToken) {
		return getLuaBitExpression(state, lhsStr, rhsStr, "and");
	} else if (opKind === ts.SyntaxKind.CaretToken) {
		return getLuaBitExpression(state, lhsStr, rhsStr, "xor");
	} else if (opKind === ts.SyntaxKind.LessThanLessThanToken) {
		return getLuaBitExpression(state, lhsStr, rhsStr, "lsh");
	} else if (opKind === ts.SyntaxKind.GreaterThanGreaterThanToken) {
		return getLuaBitExpression(state, lhsStr, rhsStr, "rsh");
	} else if (opKind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken) {
		return getLuaBitExpression(state, lhsStr, rhsStr, "lrsh");
	} else if (opKind === ts.SyntaxKind.PlusToken) {
		return getLuaAddExpression(node, lhsStr, rhsStr);
	} else if (opKind === ts.SyntaxKind.MinusToken) {
		return `${lhsStr} - ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.AsteriskToken) {
		return `${lhsStr} * ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.SlashToken) {
		return `${lhsStr} / ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.AsteriskAsteriskToken) {
		return `${lhsStr} ^ ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.InKeyword) {
		// doesn't need parenthesis because In is restrictive
		return `${rhsStr}[${lhsStr}] ~= nil`;
	} else if (opKind === ts.SyntaxKind.AmpersandAmpersandToken) {
		return `${lhsStr} and ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.BarBarToken) {
		return `${lhsStr} or ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.GreaterThanToken) {
		return `${lhsStr} > ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.LessThanToken) {
		return `${lhsStr} < ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.GreaterThanEqualsToken) {
		return `${lhsStr} >= ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.LessThanEqualsToken) {
		return `${lhsStr} <= ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.PercentToken) {
		return `${lhsStr} % ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.InstanceOfKeyword) {
		state.usesTSLibrary = true;
		return `TS.instanceof(${lhsStr}, ${rhsStr})`;
	} else {
		/* istanbul ignore next */
		throw new CompilerError(
			`Bad binary expression! (${node.getOperatorToken().getKindName()})`,
			opToken,
			CompilerErrorType.BadBinaryExpression,
		);
	}
}
