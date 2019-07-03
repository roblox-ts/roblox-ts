import * as ts from "ts-morph";
import { compileExpression } from ".";
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
import { removeBalancedParenthesisFromStringBorders, skipNodesDownwards } from "../utility";
import { isValidLuaIdentifier } from "./security";

function getExpStr(state: CompilerState, exp: ts.Expression, extraNots: number): [ts.Expression, string, number] {
	while (ts.TypeGuards.isPrefixUnaryExpression(exp) && exp.getOperatorToken() === ts.SyntaxKind.ExclamationToken) {
		exp = skipNodesDownwards(exp.getOperand());
		extraNots++;
	}

	return [exp, compileExpression(state, exp), extraNots];
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

	if (node) {
		const declaration = state.declarationContext.get(node);

		if (declaration) {
			[exp, expStr, extraNots] = getExpStr(state, exp, extraNots);
			if (declaration.needsLocalizing) {
				state.pushPrecedingStatements(node, state.indent + `local ${declaration.set};\n`);
			}
			state.currentBinaryLogicContext = id = declaration.set;
		} else {
			if (currentBinaryLogicContext) {
				id = currentBinaryLogicContext;
			} else {
				state.currentBinaryLogicContext = id = state.pushPrecedingStatementToNewId(node, "");
				isPushed = true;
			}
			[exp, expStr, extraNots] = getExpStr(state, exp, extraNots);
		}
	} else {
		[exp, expStr, extraNots] = getExpStr(state, exp, extraNots);
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

		console.log(exp.getKindName(), exp.getText(), expType.getText(), checkNumber, checkString, checkTruthy);
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

	const result = extraNots % 2 ? checks.join(" or ") : checks.join(" and ");

	if (node && rhs && id) {
		expStr = removeBalancedParenthesisFromStringBorders(expStr);
		state.enterPrecedingStatementContext();
		state.pushIndent();
		const rhsStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, rhs));
		state.popIndent();
		const context = state.exitPrecedingStatementContext();

		// TODO: (Optimization) Register this as an assignment in the context space
		if (isAnd) {
			state.pushPrecedingStatements(exp, state.indent + `-- ${node.getText()}\n`);
			state.pushPrecedingStatements(exp, state.indent + `if ${result} then\n`);
			state.pushPrecedingStatements(exp, ...context);
			state.pushPrecedingStatements(exp, state.indent + `\t${id} = ${rhsStr};\n`);
			state.pushPrecedingStatements(exp, state.indent + `else\n`);
			state.pushPrecedingStatements(exp, state.indent + `\t${id} = ${expStr};\n`);
			state.pushPrecedingStatements(exp, state.indent + `end;\n`);
		} else {
			state.pushPrecedingStatements(exp, state.indent + `-- ${node.getText()}\n`);
			state.pushPrecedingStatements(exp, state.indent + `if ${result} then\n`);
			state.pushPrecedingStatements(exp, ...context);
			state.pushPrecedingStatements(exp, state.indent + `\t${id} = ${rhsStr};\n`);
			state.pushPrecedingStatements(exp, state.indent + `else\n`);
			state.pushPrecedingStatements(exp, state.indent + `\t${id} = ${expStr};\n`);
			state.pushPrecedingStatements(exp, state.indent + `end;\n`);
		}

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
