import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { joinIndentedLines, makeSetStatement, removeBalancedParenthesisFromStringBorders } from "../utility/general";
import {
	getType,
	isBoolishTypeLax,
	isFalsyStringTypeLax,
	isLiterally0Lax,
	isNumberTypeLax,
	isTupleType,
	isUnknowableType,
} from "../utility/type";
import { isValidLuaIdentifier } from "./security";

export function compileLogicalBinary(
	state: CompilerState,
	lhs: ts.Expression,
	rhs: ts.Expression,
	isAnd: boolean,
	node: ts.BinaryExpression,
) {
	// console.log(8, node.getText());
	// let id: string | undefined;
	// const currentBinaryLogicContext = state.currentBinaryLogicContext;
	// let isPushed = false;
	// const declaration = state.declarationContext.get(node);

	// if (declaration) {
	// 	if (declaration.needsLocalizing) {
	// 		// state.pushPrecedingStatements(node, state.indent + `local `);
	// 	}

	// 	state.currentBinaryLogicContext = id = declaration.set;
	// 	state.declarationContext.delete(node);
	// } else {
	// 	if (currentBinaryLogicContext === "") {
	// 		state.currentBinaryLogicContext = id = state.pushPrecedingStatementToNewId(node, "");
	// 		// isPushed = true;
	// 	} else {
	// 		id = currentBinaryLogicContext;
	// 	}
	// }

	const truthyData = getTruthyCompileData(state, lhs, true);
	const conditionStr = compileTruthyCheck(state, lhs, truthyData);
	state.enterPrecedingStatementContext();
	const rhsStr = compileExpression(state, rhs);
	const context = state.exitPrecedingStatementContext();

	console.log(conditionStr, context);
	if (context.length === 0 && !isAnd && truthyData.checkTruthy) {
		state.pushPrecedingStatements(
			node,
			makeSetStatement(
				state,
				truthyData.expStr,
				removeBalancedParenthesisFromStringBorders(conditionStr) + " or " + rhsStr,
			),
		);
	} else {
		state.pushPrecedingStatements(
			lhs,
			state.indent +
				`if ${isAnd ? "" : "not "}${
					isAnd ? removeBalancedParenthesisFromStringBorders(conditionStr) : conditionStr
				} then\n`,
		);
		context.push(makeSetStatement(state, truthyData.expStr, rhsStr));
		state.pushPrecedingStatements(lhs, joinIndentedLines(context, 1));
		state.pushPrecedingStatements(lhs, state.indent + `end;\n`);
	}
	return truthyData.expStr;
}

function getTruthyCompileData(state: CompilerState, exp: ts.Expression, pushy = false) {
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
	const checkNon0 = isUnknown || checkNaN || isLiterally0Lax(expType);
	const checkEmptyString = isUnknown || isFalsyStringTypeLax(expType);
	const checkTruthy = isUnknown || isBoolishTypeLax(expType);
	const numChecks = Number(checkNaN) + Number(checkNon0) + Number(checkEmptyString) + Number(checkTruthy);

	let expStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, exp));

	// console.log(expStr);

	// if (expStr !== state.currentBinaryLogicContext && state.currentBinaryLogicContext) {
	// 	if (state.currentBinaryLogicContext === "return") {
	// 		state.currentBinaryLogicContext = state.pushPrecedingStatementToNewId(exp, expStr);
	// 	} else {
	// 		state.pushPrecedingStatements(exp, state.indent + `${state.currentBinaryLogicContext} = ${expStr};\n`);
	// 		expStr = state.currentBinaryLogicContext;
	// 	}
	// }

	// const currentBinaryLogicContext = state.currentBinaryLogicContext;

	// console.log(1, expStr, exp.getText(), currentBinaryLogicContext);

	const { currentBinaryLogicContext } = state;

	if (pushy || (!isValidLuaIdentifier(expStr) && numChecks > 1)) {
		if (currentBinaryLogicContext) {
			state.pushPrecedingStatements(exp, state.indent + `::${currentBinaryLogicContext} = ${expStr};\n`);
			expStr = currentBinaryLogicContext;
		} else {
			state.currentBinaryLogicContext = expStr = state.pushPrecedingStatementToNewId(exp, expStr);
		}
	}

	return { expStr, checkNon0, checkNaN, checkEmptyString, checkTruthy, currentBinaryLogicContext } as const;
}

export function compileTruthyCheck(
	state: CompilerState,
	exp: ts.Expression,
	compileData = getTruthyCompileData(state, exp),
) {
	const { expStr, checkNon0, checkNaN, checkEmptyString, checkTruthy, currentBinaryLogicContext } = compileData;
	const checks = new Array<string>();
	let shouldWrap = false;

	if (checkNon0) {
		checks.push(`${expStr} ~= 0`);
		shouldWrap = true;
	}

	if (checkNaN) {
		checks.push(`${expStr} == ${expStr}`);
		shouldWrap = true;
	}

	if (checkEmptyString) {
		checks.push(`${expStr} ~= ""`);
		shouldWrap = true;
	}

	if (checkTruthy || checks.length === 0) {
		checks.push(expStr);
	}

	const result = checks.join(" and ");

	if (currentBinaryLogicContext === "") {
		state.currentBinaryLogicContext = "";
	}

	return shouldWrap || checks.length > 1 ? `(${result})` : result;
}

// function getExpStr(
// 	state: CompilerState,
// 	exp: ts.Expression,
// 	extraNots: number,
// 	isAnd?: boolean,
// 	node?: ts.BinaryExpression,
// 	currentBinaryLogicContext?: string,
// ) {
// 	while (ts.TypeGuards.isPrefixUnaryExpression(exp) && exp.getOperatorToken() === ts.SyntaxKind.ExclamationToken) {
// 		exp = skipNodesDownwards(exp.getOperand());
// 		extraNots++;
// 	}

// 	const expStr = compileExpression(state, exp);
// 	const expType = getType(exp);

// 	if (isTupleType(expType)) {
// 		throw new CompilerError(
// 			`Cannot check a LuaTuple in a conditional! Change this to:\n\t${exp.getText()}[0]`,
// 			exp,
// 			CompilerErrorType.LuaTupleInConditional,
// 		);
// 	}

// 	const isUnknown = isUnknowableType(expType);

// 	const checkNaN = isUnknown || isNumberTypeLax(expType);
// 	const checkNon0 = isUnknown || checkNaN || is0TypeLax(expType);
// 	const checkEmptyString = isUnknown || isFalsyStringTypeLax(expType);
// 	const checkTruthy = isUnknown || isBoolishTypeLax(expType);

// 	const checks = new Array<string>();
// 	const boolify = extraNots > 0;

// 	// console.log(boolify, exp.getText());
// 	if (extraNots === 0 && isAnd === false) {
// 		extraNots++;
// 	}

// 	let mainStr: string;

// 	if (extraNots % 2) {
// 		mainStr = `not ${removeBalancedParenthesisFromStringBorders(expStr)}`;
// 	} else {
// 		if (boolify && !isBooleanTypeStrict(expType)) {
// 			mainStr = `not not ${removeBalancedParenthesisFromStringBorders(expStr)}`;
// 		} else {
// 			mainStr = expStr;
// 		}
// 	}

// 	if (checkNon0) {
// 		checks.push(extraNots % 2 ? `${expStr} == 0` : `${expStr} ~= 0`);
// 	}

// 	if (checkNaN) {
// 		checks.push(extraNots % 2 ? `${expStr} ~= ${expStr}` : `${expStr} == ${expStr}`);
// 	}

// 	if (checkEmptyString) {
// 		checks.push(`${expStr} ${extraNots % 2 ? "=" : "~"}= ""`);
// 	}

// 	if (checkTruthy || checks.length === 0) {
// 		checks.push(mainStr);
// 	}

// 	let condition = extraNots % 2 ? checks.join(" or ") : checks.join(" and ");
// 	let id: string;

// 	if (node) {
// 		const declaration = state.declarationContext.get(node);
// 		if (declaration) {
// 			if (declaration.needsLocalizing) {
// 				state.pushPrecedingStatements(
// 					node,
// 					state.indent + `local ${declaration.set} = ${boolify ? condition : expStr};\n`,
// 				);
// 			}
// 			state.currentBinaryLogicContext = id = declaration.set;
// 		} else {
// 			if (currentBinaryLogicContext) {
// 				id = currentBinaryLogicContext;
// 			} else {
// 				state.currentBinaryLogicContext = id = state.pushPrecedingStatementToNewId(
// 					node,
// 					`${boolify ? condition : expStr}`,
// 				);
// 			}
// 		}
// 	} else {
// 		id = "";
// 	}

// 	if (isAnd !== undefined) {
// 		condition = boolify ? id || condition : condition;
// 		if (isAnd === false && boolify) {
// 			condition = `not (${condition})`;
// 		}
// 	}

// 	return {
// 		condition,
// 		id,
// 	};
// }

// export function compileTruthiness(
// 	state: CompilerState,
// 	exp: ts.Expression,
// 	extraNots = 0,
// 	isAnd?: boolean,
// 	rhs?: ts.Expression,
// 	node?: ts.BinaryExpression,
// ) {
// 	const isPushed = false;

// 	const currentBinaryLogicContext = state.currentBinaryLogicContext;
// 	const { condition, id } = getExpStr(state, exp, extraNots, isAnd, node, currentBinaryLogicContext);

// 	if (node && rhs) {
// 		state.pushPrecedingStatements(exp, state.indent + `if ${condition} then -- ${node.getText()}\n`);
// 		state.pushIndent();
// 		const rhsStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, rhs));
// 		if (id !== rhsStr) {
// 			state.pushPrecedingStatements(exp, state.indent + `${id} = ${rhsStr};\n`);
// 		}
// 		state.popIndent();

// 		state.pushPrecedingStatements(exp, state.indent + `end;\n`);

// 		if (currentBinaryLogicContext === "") {
// 			state.currentBinaryLogicContext = "";
// 		}
// 		state.declarationContext.delete(node);
// 		state.getCurrentPrecedingStatementContext(node).isPushed = isPushed;
// 		return id;
// 	} else {
// 		// console.log("got", condition, exp.getKindName(), exp.getText());
// 		return condition;
// 	}
// }
