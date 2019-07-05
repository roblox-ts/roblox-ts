import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	getType,
	is0TypeLax,
	isBooleanTypeStrict,
	isBoolishTypeLax,
	isFalsyStringTypeLax,
	isNumberTypeLax,
	isTupleType,
	isUnknowableType,
} from "../typeUtilities";
import { removeBalancedParenthesisFromStringBorders, skipNodesDownwards } from "../utility";

function compileTruthyCheck(state: CompilerState, exp: ts.Expression) {
	const expStr = compileExpression(state, exp);
}

function getExpStr(
	state: CompilerState,
	exp: ts.Expression,
	extraNots: number,
	isAnd?: boolean,
	node?: ts.BinaryExpression,
	currentBinaryLogicContext?: string,
) {
	while (ts.TypeGuards.isPrefixUnaryExpression(exp) && exp.getOperatorToken() === ts.SyntaxKind.ExclamationToken) {
		exp = skipNodesDownwards(exp.getOperand());
		extraNots++;
	}

	const expStr = compileExpression(state, exp);
	const expType = getType(exp);

	if (isTupleType(expType)) {
		throw new CompilerError(
			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
			exp,
			CompilerErrorType.LuaTupleInConditional,
		);
	}

	const isUnknown = isUnknowableType(expType);

	const checkNaN = isUnknown || isNumberTypeLax(expType);
	const checkNon0 = isUnknown || checkNaN || is0TypeLax(expType);
	const checkEmptyString = isUnknown || isFalsyStringTypeLax(expType);
	const checkTruthy = isUnknown || isBoolishTypeLax(expType);

	const checks = new Array<string>();
	const boolify = extraNots > 0;

	// console.log(boolify, exp.getText());
	if (extraNots === 0 && isAnd === false) {
		extraNots++;
	}

	let mainStr: string;

	if (extraNots % 2) {
		mainStr = `not ${removeBalancedParenthesisFromStringBorders(expStr)}`;
	} else {
		if (boolify && !isBooleanTypeStrict(expType)) {
			mainStr = `not not ${removeBalancedParenthesisFromStringBorders(expStr)}`;
		} else {
			mainStr = expStr;
		}
	}

	if (checkNon0) {
		checks.push(extraNots % 2 ? `${expStr} == 0` : `${expStr} ~= 0`);
	}

	if (checkNaN) {
		checks.push(extraNots % 2 ? `${expStr} ~= ${expStr}` : `${expStr} == ${expStr}`);
	}

	if (checkEmptyString) {
		checks.push(`${expStr} ${extraNots % 2 ? "=" : "~"}= ""`);
	}

	if (checkTruthy || checks.length === 0) {
		checks.push(mainStr);
	}

	let condition = extraNots % 2 ? checks.join(" or ") : checks.join(" and ");
	let id: string;

	if (node) {
		const declaration = state.declarationContext.get(node);
		if (declaration) {
			if (declaration.needsLocalizing) {
				state.pushPrecedingStatements(
					node,
					state.indent + `local ${declaration.set} = ${boolify ? condition : expStr};\n`,
				);
			}
			state.currentBinaryLogicContext = id = declaration.set;
		} else {
			if (currentBinaryLogicContext) {
				id = currentBinaryLogicContext;
			} else {
				state.currentBinaryLogicContext = id = state.pushPrecedingStatementToNewId(
					node,
					`${boolify ? condition : expStr}`,
				);
			}
		}
	} else {
		id = "";
	}

	if (isAnd !== undefined) {
		condition = boolify ? id || condition : condition;
		if (isAnd === false && boolify) {
			condition = `not (${condition})`;
		}
	}

	return {
		condition,
		id,
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
	const isPushed = false;

	const currentBinaryLogicContext = state.currentBinaryLogicContext;
	const { condition, id } = getExpStr(state, exp, extraNots, isAnd, node, currentBinaryLogicContext);

	if (node && rhs) {
		state.pushPrecedingStatements(exp, state.indent + `if ${condition} then -- ${node.getText()}\n`);
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
		// console.log("got", condition, exp.getKindName(), exp.getText());
		return condition;
	}
}
