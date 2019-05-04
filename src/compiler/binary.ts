import * as ts from "ts-morph";
import { checkNonAny, compileCallExpression, compileExpression, concatNamesAndValues, getBindingData } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { isNumberType, isStringType, isTupleReturnTypeCall, shouldPushToPrecedingStatement } from "../typeUtilities";
import { getAccessorForBindingPatternType } from "./binding";
import { getWritableOperandName } from "./indexed";

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

export function compileBinaryExpression(state: CompilerState, node: ts.BinaryExpression) {
	const opToken = node.getOperatorToken();
	const opKind = opToken.getKind();

	const lhs = node.getLeft();
	const rhs = node.getRight();
	let lhsStr: string;
	let rhsStr: string;

	if (opKind !== ts.SyntaxKind.EqualsToken) {
		checkNonAny(lhs);
		checkNonAny(rhs);
	}

	// binding patterns
	if (ts.TypeGuards.isArrayLiteralExpression(lhs)) {
		const names = new Array<string>();
		const values = new Array<string>();
		const preStatements = new Array<string>();
		const postStatements = new Array<string>();

		let result = "";

		const isFlatBinding = lhs
			.getElements()
			.filter(v => ts.TypeGuards.isBindingElement(v))
			.every(v => ts.TypeGuards.isIdentifier(v.getChildAtIndex(0)));
		if (isFlatBinding && rhs && ts.TypeGuards.isCallExpression(rhs) && isTupleReturnTypeCall(rhs)) {
			for (const element of lhs.getElements()) {
				if (ts.TypeGuards.isIdentifier(element)) {
					names.push(compileExpression(state, element));
				} else if (ts.TypeGuards.isOmittedExpression(element)) {
					names.push("_");
				}
			}
			values.push(compileCallExpression(state, rhs, true));
			concatNamesAndValues(state, names, values, false, declaration => (result += declaration), false, false);
		} else {
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

			const parent = node.getParentOrThrow();
			if (ts.TypeGuards.isExpressionStatement(parent) || ts.TypeGuards.isForStatement(parent)) {
				preStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
				concatNamesAndValues(state, names, values, false, declaration => (result += declaration));
				postStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
				result = result.replace(/;\n$/, ""); // terrible hack
			} else {
				preStatements.forEach(statementStr =>
					state.pushPrecedingStatements(rhs, state.indent + statementStr + "\n"),
				);
				concatNamesAndValues(state, names, values, false, declaration =>
					state.pushPrecedingStatements(node, declaration),
				);
				postStatements.forEach(statementStr =>
					state.pushPrecedingStatements(lhs, state.indent + statementStr + "\n"),
				);
				result += state.indent + `return ${rootId};\n`;
				return rootId;
			}
		}
		return result;
	}

	if (isSetToken(opKind)) {
		lhsStr =
			opKind === ts.SyntaxKind.EqualsToken ? compileExpression(state, lhs) : getWritableOperandName(state, lhs);
		state.enterPrecedingStatementContext();
		rhsStr = compileExpression(state, rhs);
		const rhsStrContext = state.exitPrecedingStatementContext();
		let previouslhs: string;

		if (rhsStrContext.length > 0) {
			previouslhs =
				opKind === ts.SyntaxKind.EqualsToken
					? ""
					: state.pushPrecedingStatementToNextId(lhs, lhsStr, rhsStrContext);

			state.pushPrecedingStatements(rhs, ...rhsStrContext);
		} else {
			previouslhs = lhsStr;
		}

		let statementStr: string;

		/* istanbul ignore else */
		if (opKind === ts.SyntaxKind.EqualsToken) {
			statementStr = `${lhsStr} = ${rhsStr}`;
		} else if (opKind === ts.SyntaxKind.BarEqualsToken) {
			const barExpStr = getLuaBarExpression(state, node, previouslhs, rhsStr);
			statementStr = `${lhsStr} = ${barExpStr}`;
		} else if (opKind === ts.SyntaxKind.AmpersandEqualsToken) {
			const ampersandExpStr = getLuaBitExpression(state, previouslhs, rhsStr, "and");
			statementStr = `${lhsStr} = ${ampersandExpStr}`;
		} else if (opKind === ts.SyntaxKind.CaretEqualsToken) {
			const caretExpStr = getLuaBitExpression(state, previouslhs, rhsStr, "xor");
			statementStr = `${lhsStr} = ${caretExpStr}`;
		} else if (opKind === ts.SyntaxKind.LessThanLessThanEqualsToken) {
			const lhsExpStr = getLuaBitExpression(state, previouslhs, rhsStr, "lsh");
			statementStr = `${lhsStr} = ${lhsExpStr}`;
		} else if (opKind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken) {
			const rhsExpStr = getLuaBitExpression(state, previouslhs, rhsStr, "rsh");
			statementStr = `${lhsStr} = ${rhsExpStr}`;
		} else if (opKind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken) {
			const rhsExpStr = getLuaBitExpression(state, previouslhs, rhsStr, "lrsh");
			statementStr = `${lhsStr} = ${rhsExpStr}`;
		} else if (opKind === ts.SyntaxKind.PlusEqualsToken) {
			const addExpStr = getLuaAddExpression(node, previouslhs, rhsStr, true);
			statementStr = `${lhsStr} = ${addExpStr}`;
		} else if (opKind === ts.SyntaxKind.MinusEqualsToken) {
			statementStr = `${lhsStr} = ${previouslhs} - (${rhsStr})`;
		} else if (opKind === ts.SyntaxKind.AsteriskEqualsToken) {
			statementStr = `${lhsStr} = ${previouslhs} * (${rhsStr})`;
		} else if (opKind === ts.SyntaxKind.SlashEqualsToken) {
			statementStr = `${lhsStr} = ${previouslhs} / (${rhsStr})`;
		} else if (opKind === ts.SyntaxKind.AsteriskAsteriskEqualsToken) {
			statementStr = `${lhsStr} = ${previouslhs} ^ (${rhsStr})`;
		} else if (opKind === ts.SyntaxKind.PercentEqualsToken) {
			statementStr = `${lhsStr} = ${previouslhs} % (${rhsStr})`;
		} else {
			throw new CompilerError(
				"You just discovered a new kind of BinaryExpression! (" +
					opToken.getText() +
					") Please submit an issue request at https://github.com/roblox-ts/roblox-ts/issues",
				opToken,
				CompilerErrorType.BadBinaryExpression,
			);
		}

		const parentKind = node.getParentOrThrow().getKind();
		if (parentKind === ts.SyntaxKind.ExpressionStatement || parentKind === ts.SyntaxKind.ForStatement) {
			return statementStr;
		} else {
			state.pushPrecedingStatements(node, state.indent + statementStr + ";\n");
			return lhsStr;
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
				lhsStr = state.pushPrecedingStatementToNextId(lhs, lhsStr, rhsContext);
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
