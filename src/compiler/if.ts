import * as ts from "ts-morph";
import { compileExpression, compileStatement } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	getType,
	isBoolishTypeLax,
	isFalsyNumberTypeLax,
	isFalsyStringTypeLax,
	isTupleType,
	isUnknowableType,
} from "../typeUtilities";
import { joinIndentedLines, skipNodesDownwards } from "../utility";
import { isValidLuaIdentifier } from "./security";

export function compileTruthiness(
	state: CompilerState,
	exp: ts.Expression,
	expStr?: string,
	applyNot = false,
	lhsCheck?: boolean,
) {
	let extraNots = applyNot ? 1 : 0;

	if (expStr === undefined) {
		while (
			ts.TypeGuards.isPrefixUnaryExpression(exp) &&
			exp.getOperatorToken() === ts.SyntaxKind.ExclamationToken
		) {
			exp = skipNodesDownwards(exp.getOperand());
			extraNots++;
		}
		expStr = compileExpression(state, exp);
	}

	const checks = new Array<string>();
	let checkNumber: boolean;
	let checkString: boolean;
	let checkTruthy: boolean;

	{
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
		checkNumber = isUnknown || isFalsyNumberTypeLax(expType);
		checkString = isUnknown || isFalsyStringTypeLax(expType);
		checkTruthy = isUnknown || isBoolishTypeLax(expType);
	}

	if (checkNumber || checkString) {
		if (!isValidLuaIdentifier(expStr)) {
			expStr = state.pushPrecedingStatementToNewId(exp, expStr);
		}

		if (checkNumber) {
			checks.push(
				extraNots % 2
					? `${expStr} == 0 or ${expStr} ~= ${expStr}`
					: `${expStr} ~= 0 and ${expStr} == ${expStr}`,
			);
		}

		if (checkString) {
			checks.push(extraNots % 2 ? `${expStr} == ""` : `${expStr} ~= ""`);
		}
	}

	if (checkTruthy) {
		if (extraNots % 2) {
			checks.push(`not ${expStr}`);
		} else {
			if (extraNots > 0) {
				checks.push(`not not ${expStr}`);
			} else {
				checks.push(expStr);
			}
		}
	}

	if (checks.length === 0) {
		checks.push(expStr);
	}

	let result = extraNots % 2 ? checks.join(" or ") : checks.join(" and ");

	if (lhsCheck === true) {
		const id = state.pushPrecedingStatementToNewId(exp, "");
		state.pushPrecedingStatements(
			exp,
			state.indent + `if ${result} then\n`,
			state.indent + `\t${id} = ${expStr};\n`,
			state.indent + `else\n`,
			state.indent + `\t${id} = true;\n`,
			state.indent + `end;\n`,
		);
		result = `${id} ~= true and ${expStr}`;
	} else if (lhsCheck === false) {
	}

	return result;
}

export function compileIfStatement(state: CompilerState, node: ts.IfStatement) {
	state.enterPrecedingStatementContext();
	const expStr = compileTruthiness(state, skipNodesDownwards(node.getExpression()));
	const lines = state.exitPrecedingStatementContext();
	lines.push(state.indent + `if ${expStr} then\n`);
	state.pushIndent();
	lines.push(compileStatement(state, node.getThenStatement()));
	state.popIndent();
	let elseStatement = node.getElseStatement();
	let numBlocks = 1;

	while (elseStatement && ts.TypeGuards.isIfStatement(elseStatement)) {
		state.enterPrecedingStatementContext();
		state.pushIndent();
		const elseIfExpression = compileTruthiness(state, skipNodesDownwards(elseStatement.getExpression()));
		const context = state.exitPrecedingStatementContext();

		if (context.length > 0) {
			state.popIndent();
			lines.push(state.indent + `else\n`);
			state.pushIndent();
			numBlocks++;
			lines.push(joinIndentedLines(context));
			lines.push(state.indent + `if ${elseIfExpression} then\n`);
		} else {
			state.popIndent();
			lines.push(state.indent + `elseif ${elseIfExpression} then\n`);
		}

		state.pushIndent();
		lines.push(compileStatement(state, elseStatement.getThenStatement()));
		state.popIndent();
		elseStatement = elseStatement.getElseStatement();
	}

	if (elseStatement) {
		lines.push(state.indent + "else\n");
		state.pushIndent();
		lines.push(compileStatement(state, elseStatement));
		state.popIndent();
	}

	lines.push(state.indent + `end;\n`);

	for (let i = 1; i < numBlocks; i++) {
		state.popIndent();
		lines.push(state.indent + `end;\n`);
	}

	return lines.join("");
}
