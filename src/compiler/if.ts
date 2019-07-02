import * as ts from "ts-morph";
import { compileExpression, compileStatement } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	getType,
	isNumberOrString,
	isNumberTypeLax,
	isStringTypeLax,
	isTupleType,
	isUnknowableType,
} from "../typeUtilities";
import { joinIndentedLines, skipNodesDownwards } from "../utility";
import { isValidLuaIdentifier } from "./security";

export function assertNonLuaTuple(exp: ts.Expression) {
	if (isTupleType(getType(exp))) {
		throw new CompilerError(
			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
			exp,
			CompilerErrorType.LuaTupleInConditional,
		);
	}
	return exp;
}

export function conditionalCheck(state: CompilerState, exp: ts.Expression, expStr: string, applyNot = false) {
	const checks = new Array<string>();
	let checkNumber: boolean;
	let checkString: boolean;
	let checkTruthy: boolean;

	{
		const expType = getType(exp);
		const isUnknown = isUnknowableType(expType);
		checkNumber = isUnknown || isNumberTypeLax(expType);
		checkString = isUnknown || isStringTypeLax(expType);
		checkTruthy = isUnknown || !isNumberOrString(expType);
	}

	if (checkNumber || checkString) {
		if (!isValidLuaIdentifier(expStr)) {
			expStr = state.pushPrecedingStatementToNewId(exp, expStr);
		}

		if (checkNumber) {
			checks.push(
				applyNot ? `${expStr} == 0 or ${expStr} ~= ${expStr}` : `${expStr} ~= 0 and ${expStr} == ${expStr}`,
			);
		}

		if (checkString) {
			checks.push(applyNot ? `${expStr} == ""` : `${expStr} ~= ""`);
		}
	}

	if (checkTruthy) {
		checks.push(applyNot ? `not ${expStr}` : `${expStr}`);
	}

	return applyNot ? checks.join(" or ") : checks.join(" and ");
}

export function compileIfStatement(state: CompilerState, node: ts.IfStatement) {
	let result = "";
	state.enterPrecedingStatementContext();
	const conditionExp = skipNodesDownwards(assertNonLuaTuple(node.getExpression()));
	let expStr = compileExpression(state, conditionExp);
	expStr = conditionalCheck(state, conditionExp, expStr);
	result += state.exitPrecedingStatementContextAndJoin();
	result += state.indent + `if ${expStr} then\n`;
	state.pushIndent();
	result += compileStatement(state, node.getThenStatement());
	state.popIndent();
	let elseStatement = node.getElseStatement();
	let numBlocks = 1;

	while (elseStatement && ts.TypeGuards.isIfStatement(elseStatement)) {
		state.enterPrecedingStatementContext();
		state.pushIndent();
		const exp = skipNodesDownwards(assertNonLuaTuple(elseStatement.getExpression()));
		const elseIfExpression = compileExpression(state, exp);
		const context = state.exitPrecedingStatementContext();

		if (context.length > 0) {
			state.popIndent();
			result += state.indent + `else\n`;
			state.pushIndent();
			numBlocks++;
			result += joinIndentedLines(context);
			result += state.indent + `if ${elseIfExpression} then\n`;
		} else {
			state.popIndent();
			result += state.indent + `elseif ${elseIfExpression} then\n`;
		}

		state.pushIndent();
		result += compileStatement(state, elseStatement.getThenStatement());
		state.popIndent();
		elseStatement = elseStatement.getElseStatement();
	}

	if (elseStatement) {
		result += state.indent + "else\n";
		state.pushIndent();
		result += compileStatement(state, elseStatement);
		state.popIndent();
	}

	result += state.indent + `end;\n`;

	for (let i = 1; i < numBlocks; i++) {
		state.popIndent();
		result += state.indent + `end;\n`;
	}
	return result;
}
