import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";

function getLuaBarExpression(node: ts.BinaryExpression, lhsStr: string, rhsStr: string) {
	let rhs = node.getRight();
	if (ts.TypeGuards.isParenthesizedExpression(rhs)) {
		rhs = rhs.getExpression();
	}
	if (ts.TypeGuards.isNumericLiteral(rhs) && rhs.getLiteralValue() === 0) {
		return `TS.round(${lhsStr})`;
	} else {
		return `TS.bor(${lhsStr}, ${rhsStr})`;
	}
}

function getLuaBitExpression(node: ts.BinaryExpression, lhsStr: string, rhsStr: string, name: string) {
	return `TS.b${name}(${lhsStr}, ${rhsStr})`;
}

function getLuaAddExpression(node: ts.BinaryExpression, lhsStr: string, rhsStr: string, wrap = false) {
	if (wrap) {
		rhsStr = `(${rhsStr})`;
	}
	const leftType = node.getLeft().getType();
	const rightType = node.getRight().getType();
	if (leftType.isString() || rightType.isString() || leftType.isStringLiteral() || rightType.isStringLiteral()) {
		return `(${lhsStr}) .. ${rhsStr}`;
	} else if (
		(leftType.isNumber() || leftType.isNumberLiteral()) &&
		(rightType.isNumber() || rightType.isNumberLiteral())
	) {
		return `${lhsStr} + ${rhsStr}`;
	} else {
		return `TS.add(${lhsStr}, ${rhsStr})`;
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
		opKind === ts.SyntaxKind.PlusEqualsToken ||
		opKind === ts.SyntaxKind.MinusEqualsToken ||
		opKind === ts.SyntaxKind.AsteriskEqualsToken ||
		opKind === ts.SyntaxKind.SlashEqualsToken ||
		opKind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
		opKind === ts.SyntaxKind.PercentEqualsToken
	);
}

export function transpileBinaryExpression(state: TranspilerState, node: ts.BinaryExpression) {
	const opToken = node.getOperatorToken();
	const opKind = opToken.getKind();

	const lhs = node.getLeft();
	const rhs = node.getRight();
	let lhsStr: string;
	const rhsStr = transpileExpression(state, rhs);
	const statements = new Array<string>();

	function getOperandStr() {
		switch (opKind) {
			case ts.SyntaxKind.EqualsToken:
				return `${lhsStr} = ${rhsStr}`;
			/* Bitwise Operations */
			case ts.SyntaxKind.BarEqualsToken:
				const barExpStr = getLuaBarExpression(node, lhsStr, rhsStr);
				return `${lhsStr} = ${barExpStr}`;
			case ts.SyntaxKind.AmpersandEqualsToken:
				const ampersandExpStr = getLuaBitExpression(node, lhsStr, rhsStr, "and");
				return `${lhsStr} = ${ampersandExpStr}`;
			case ts.SyntaxKind.CaretEqualsToken:
				const caretExpStr = getLuaBitExpression(node, lhsStr, rhsStr, "xor");
				return `${lhsStr} = ${caretExpStr}`;
			case ts.SyntaxKind.LessThanLessThanEqualsToken:
				const lshExpStr = getLuaBitExpression(node, lhsStr, rhsStr, "lsh");
				return `${lhsStr} = ${lshExpStr}`;
			case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken:
				const rshExpStr = getLuaBitExpression(node, lhsStr, rhsStr, "rsh");
				return `${lhsStr} = ${rshExpStr}`;
			case ts.SyntaxKind.PlusEqualsToken:
				const addExpStr = getLuaAddExpression(node, lhsStr, rhsStr, true);
				return `${lhsStr} = ${addExpStr}`;
			case ts.SyntaxKind.MinusEqualsToken:
				return `${lhsStr} = ${lhsStr} - (${rhsStr})`;
			case ts.SyntaxKind.AsteriskEqualsToken:
				return `${lhsStr} = ${lhsStr} * (${rhsStr})`;
			case ts.SyntaxKind.SlashEqualsToken:
				return `${lhsStr} = ${lhsStr} / (${rhsStr})`;
			case ts.SyntaxKind.AsteriskAsteriskEqualsToken:
				return `${lhsStr} = ${lhsStr} ^ (${rhsStr})`;
			case ts.SyntaxKind.PercentEqualsToken:
				return `${lhsStr} = ${lhsStr} % (${rhsStr})`;
		}
		throw new TranspilerError("Unrecognized operation! #1", node, TranspilerErrorType.UnrecognizedOperation1);
	}

	if (isSetToken(opKind)) {
		if (ts.TypeGuards.isPropertyAccessExpression(lhs) && opKind !== ts.SyntaxKind.EqualsToken) {
			const expression = lhs.getExpression();
			const opExpStr = transpileExpression(state, expression);
			const propertyStr = lhs.getName();
			const id = state.getNewId();
			statements.push(`local ${id} = ${opExpStr}`);
			lhsStr = `${id}.${propertyStr}`;
		} else {
			lhsStr = transpileExpression(state, lhs);
		}
		statements.push(getOperandStr());
		const parentKind = node.getParentOrThrow().getKind();
		if (parentKind === ts.SyntaxKind.ExpressionStatement || parentKind === ts.SyntaxKind.ForStatement) {
			return statements.join("; ");
		} else {
			const statementsStr = statements.join("; ");
			return `(function() ${statementsStr}; return ${lhsStr}; end)()`;
		}
	} else {
		lhsStr = transpileExpression(state, lhs);
	}

	switch (opKind) {
		case ts.SyntaxKind.EqualsEqualsToken:
			throw new TranspilerError(
				"operator '==' is not supported! Use '===' instead.",
				opToken,
				TranspilerErrorType.NoEqualsEquals,
			);
		case ts.SyntaxKind.EqualsEqualsEqualsToken:
			return `${lhsStr} == ${rhsStr}`;
		case ts.SyntaxKind.ExclamationEqualsToken:
			throw new TranspilerError(
				"operator '!=' is not supported! Use '!==' instead.",
				opToken,
				TranspilerErrorType.NoExclamationEquals,
			);
		case ts.SyntaxKind.ExclamationEqualsEqualsToken:
			return `${lhsStr} ~= ${rhsStr}`;
		/* Bitwise Operations */
		case ts.SyntaxKind.BarToken:
			return getLuaBarExpression(node, lhsStr, rhsStr);
		case ts.SyntaxKind.AmpersandToken:
			return getLuaBitExpression(node, lhsStr, rhsStr, "and");
		case ts.SyntaxKind.CaretToken:
			return getLuaBitExpression(node, lhsStr, rhsStr, "xor");
		case ts.SyntaxKind.LessThanLessThanToken:
			return getLuaBitExpression(node, lhsStr, rhsStr, "lsh");
		case ts.SyntaxKind.GreaterThanGreaterThanToken:
			return getLuaBitExpression(node, lhsStr, rhsStr, "rsh");
		case ts.SyntaxKind.PlusToken:
			return getLuaAddExpression(node, lhsStr, rhsStr);
		case ts.SyntaxKind.MinusToken:
			return `${lhsStr} - ${rhsStr}`;
		case ts.SyntaxKind.AsteriskToken:
			return `${lhsStr} * ${rhsStr}`;
		case ts.SyntaxKind.SlashToken:
			return `${lhsStr} / ${rhsStr}`;
		case ts.SyntaxKind.AsteriskAsteriskToken:
			return `${lhsStr} ^ ${rhsStr}`;
		case ts.SyntaxKind.InKeyword:
			return `${rhsStr}[${lhsStr}] ~= nil`;
		case ts.SyntaxKind.AmpersandAmpersandToken:
			return `${lhsStr} and ${rhsStr}`;
		case ts.SyntaxKind.BarBarToken:
			return `${lhsStr} or ${rhsStr}`;
		case ts.SyntaxKind.GreaterThanToken:
			return `${lhsStr} > ${rhsStr}`;
		case ts.SyntaxKind.LessThanToken:
			return `${lhsStr} < ${rhsStr}`;
		case ts.SyntaxKind.GreaterThanEqualsToken:
			return `${lhsStr} >= ${rhsStr}`;
		case ts.SyntaxKind.LessThanEqualsToken:
			return `${lhsStr} <= ${rhsStr}`;
		case ts.SyntaxKind.PercentToken:
			return `${lhsStr} % ${rhsStr}`;
		case ts.SyntaxKind.InstanceOfKeyword:
			return `TS.instanceof(${lhsStr}, ${rhsStr})`;
		default:
			const opKindName = node.getOperatorToken().getKindName();
			throw new TranspilerError(
				`Bad binary expression! (${opKindName})`,
				opToken,
				TranspilerErrorType.BadBinaryExpression,
			);
	}
}
