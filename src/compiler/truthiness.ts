import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	getType,
	isBooleanTypeStrict,
	isBoolishTypeLax,
	isFalsyNumberTypeLax,
	isFalsyStringTypeLax,
	isTupleType,
	isUnknowableType,
} from "../typeUtilities";
import { removeBalancedParenthesisFromStringBorders, skipNodesDownwards } from "../utility";

function getExpStr(state: CompilerState, exp: ts.Expression, extraNots: number, node?: ts.BinaryExpression) {
	while (ts.TypeGuards.isPrefixUnaryExpression(exp) && exp.getOperatorToken() === ts.SyntaxKind.ExclamationToken) {
		exp = skipNodesDownwards(exp.getOperand());
		extraNots++;
	}

	const expStr = compileExpression(state, exp);

	if (ts.TypeGuards.isParenthesizedExpression(exp)) {
		exp = skipNodesDownwards(exp.getExpression());
	}

	const expType = getType(exp);

	if (isTupleType(expType)) {
		throw new CompilerError(
			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
			exp,
			CompilerErrorType.LuaTupleInConditional,
		);
	}

	const isUnknown = isUnknowableType(expType);

	let mainStr: string;

	if (extraNots % 2) {
		mainStr = `not (${removeBalancedParenthesisFromStringBorders(expStr)})`;
	} else {
		if (extraNots > 0 && !isBooleanTypeStrict(expType) && !node) {
			mainStr = `not not (${removeBalancedParenthesisFromStringBorders(expStr)})`;
		} else {
			mainStr = expStr;
		}
	}

	return {
		checkNumber: isUnknown || isFalsyNumberTypeLax(expType),
		checkString: isUnknown || isFalsyStringTypeLax(expType),
		checkTruthy: isUnknown || isBoolishTypeLax(expType),
		expStr,
		extraNots,
		mainStr,
	};
}

export function compileTruthiness(
	state: CompilerState,
	exp: ts.Expression,
	extraNots = 0,
	isAnd?: boolean,
	rhs?: ts.Expression,
	node?: ts.BinaryExpression,
) {
	let expStr: string;
	let id: string | undefined;
	let isPushed = false;
	const currentBinaryLogicContext = state.currentBinaryLogicContext;

	const checks = new Array<string>();
	let checkNumber: boolean;
	let checkString: boolean;
	let checkTruthy: boolean;
	let mainStr: string;

	if (node) {
		const declaration = state.declarationContext.get(node);

		if (declaration) {
			state.currentBinaryLogicContext = id = declaration.set;
			({ checkNumber, checkString, checkTruthy, mainStr, expStr } = getExpStr(state, exp, extraNots));
			if (declaration.needsLocalizing) {
				state.pushPrecedingStatements(node, state.indent + `local ${declaration.set} = ${expStr};\n`);
			}
		} else {
			({ checkNumber, checkString, checkTruthy, mainStr, expStr } = getExpStr(state, exp, extraNots));
			if (currentBinaryLogicContext) {
				id = currentBinaryLogicContext;
			} else {
				state.currentBinaryLogicContext = id = state.pushPrecedingStatementToNewId(node, expStr);
				isPushed = true;
			}
		}
	} else {
		({ checkNumber, checkString, checkTruthy, mainStr, expStr } = getExpStr(state, exp, extraNots));
	}

	if (checkNumber) {
		checks.push(
			extraNots % 2 ? `${expStr} == 0 or ${expStr} ~= ${expStr}` : `${expStr} ~= 0 and ${expStr} == ${expStr}`,
		);
	}

	if (checkString) {
		checks.push(extraNots % 2 ? `${expStr} == ""` : `${expStr} ~= ""`);
	}

	if (checkTruthy || checks.length === 0) {
		checks.push(mainStr);
	}

	const result = extraNots % 2 ? checks.join(" or ") : checks.join(" and ");

	if (node && rhs && id) {
		state.pushPrecedingStatements(exp, state.indent + `-- ${node.getText()}\n`);
		state.pushPrecedingStatements(exp, state.indent + `if ${result} then\n`);
		state.pushIndent();
		const rhsStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, rhs));
		if (id !== rhsStr) {
			state.pushPrecedingStatements(exp, state.indent + `${id} = ${rhsStr};\n`);
		}
		state.popIndent();

		state.pushPrecedingStatements(exp, state.indent + `end;\n`);

		if (currentBinaryLogicContext === "") {
			state.currentBinaryLogicContext = "";
		}
		state.declarationContext.delete(node);
		state.getCurrentPrecedingStatementContext(node).isPushed = isPushed;
		return id;
	} else {
		return result;
	}
}
