import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isNumberType, isStringType } from "../typeUtilities";
import { getBindingData } from "./binding";
import { checkNonAny } from "./security";

function getLuaBarExpression(state: TranspilerState, node: ts.BinaryExpression, lhsStr: string, rhsStr: string) {
	state.usesTSLibrary = true;
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

function getLuaBitExpression(
	state: TranspilerState,
	lhsStr: string,
	rhsStr: string,
	name: string,
) {
	state.usesTSLibrary = true;
	return `TS.b${name}(${lhsStr}, ${rhsStr})`;
}

function getLuaAddExpression(
	state: TranspilerState,
	node: ts.BinaryExpression,
	lhsStr: string,
	rhsStr: string,
	wrap = false,
) {
	if (wrap) {
		rhsStr = `(${rhsStr})`;
	}
	const leftType = node.getLeft().getType();
	const rightType = node.getRight().getType();
	if (isStringType(leftType) || isStringType(rightType)) {
		return `(${lhsStr}) .. ${rhsStr}`;
	} else if (isNumberType(leftType) && isNumberType(rightType)) {
		return `${lhsStr} + ${rhsStr}`;
	} else {
		state.usesTSLibrary = true;
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

		let rootId: string;
		if (ts.TypeGuards.isIdentifier(rhs)) {
			rootId = transpileExpression(state, rhs);
		} else {
			rootId = state.getNewId();
			preStatements.push(`local ${rootId} = ${transpileExpression(state, rhs)};`);
		}
		getBindingData(state, names, values, preStatements, postStatements, lhs, rootId);

		let result = "";
		const parentKind = node.getParentOrThrow().getKind();
		if (parentKind === ts.SyntaxKind.ExpressionStatement || parentKind === ts.SyntaxKind.ForStatement) {
			preStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
			result += state.indent + `${names.join(", ")} = ${values.join(", ")};\n`;
			postStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
			result = result.replace(/;\n$/, ""); // terrible hack
		} else {
			result += `(function()\n`;
			state.pushIndent();
			preStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
			result += state.indent + `${names.join(", ")} = ${values.join(", ")};\n`;
			postStatements.forEach(statementStr => (result += state.indent + statementStr + "\n"));
			result += state.indent + `return ${rootId};\n`;
			state.popIndent();
			result += `end)()`;
		}
		return result;
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

		if (opKind === ts.SyntaxKind.EqualsToken) {
			statements.push(`${lhsStr} = ${rhsStr}`);
		} else if (opKind === ts.SyntaxKind.BarEqualsToken) {
			const barExpStr = getLuaBarExpression(state, node, lhsStr, rhsStr);
			statements.push(`${lhsStr} = ${barExpStr}`);
		} else if (opKind === ts.SyntaxKind.AmpersandEqualsToken) {
			const ampersandExpStr = getLuaBitExpression(state, lhsStr, rhsStr, "and");
			statements.push(`${lhsStr} = ${ampersandExpStr}`);
		} else if (opKind === ts.SyntaxKind.CaretEqualsToken) {
			const caretExpStr = getLuaBitExpression(state, lhsStr, rhsStr, "xor");
			statements.push(`${lhsStr} = ${caretExpStr}`);
		} else if (opKind === ts.SyntaxKind.LessThanLessThanEqualsToken) {
			const lhsExpStr = getLuaBitExpression(state, lhsStr, rhsStr, "lsh");
			statements.push(`${lhsStr} = ${lhsExpStr}`);
		} else if (opKind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken) {
			const rhsExpStr = getLuaBitExpression(state, lhsStr, rhsStr, "rsh");
			statements.push(`${lhsStr} = ${rhsExpStr}`);
		} else if (opKind === ts.SyntaxKind.PlusEqualsToken) {
			const addExpStr = getLuaAddExpression(state, node, lhsStr, rhsStr, true);
			statements.push(`${lhsStr} = ${addExpStr}`);
		} else if (opKind === ts.SyntaxKind.MinusEqualsToken) {
			statements.push(`${lhsStr} = ${lhsStr} - (${rhsStr})`);
		} else if (opKind === ts.SyntaxKind.AsteriskEqualsToken) {
			statements.push(`${lhsStr} = ${lhsStr} * (${rhsStr})`);
		} else if (opKind === ts.SyntaxKind.SlashEqualsToken) {
			statements.push(`${lhsStr} = ${lhsStr} / (${rhsStr})`);
		} else if (opKind === ts.SyntaxKind.AsteriskAsteriskEqualsToken) {
			statements.push(`${lhsStr} = ${lhsStr} ^ (${rhsStr})`);
		} else if (opKind === ts.SyntaxKind.PercentEqualsToken) {
			statements.push(`${lhsStr} = ${lhsStr} % (${rhsStr})`);
		} else {
			throw new TranspilerError("Unrecognized operation! #1", node, TranspilerErrorType.UnrecognizedOperation1);
		}

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

	if (opKind === ts.SyntaxKind.EqualsEqualsToken) {
		throw new TranspilerError(
			"operator '==' is not supported! Use '===' instead.",
			opToken,
			TranspilerErrorType.NoEqualsEquals,
		);
	} else if (opKind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
		return `${lhsStr} == ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.ExclamationEqualsToken) {
		throw new TranspilerError(
			"operator '!=' is not supported! Use '!==' instead.",
			opToken,
			TranspilerErrorType.NoExclamationEquals,
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
	} else if (opKind === ts.SyntaxKind.PlusToken) {
		return getLuaAddExpression(state, node, lhsStr, rhsStr);
	} else if (opKind === ts.SyntaxKind.MinusToken) {
		return `${lhsStr} - ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.AsteriskToken) {
		return `${lhsStr} * ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.SlashToken) {
		return `${lhsStr} / ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.AsteriskAsteriskToken) {
		return `${lhsStr} ^ ${rhsStr}`;
	} else if (opKind === ts.SyntaxKind.InKeyword) {
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
		const opKindName = node.getOperatorToken().getKindName();
		throw new TranspilerError(
			`Bad binary expression! (${opKindName})`,
			opToken,
			TranspilerErrorType.BadBinaryExpression,
		);
	}
}
