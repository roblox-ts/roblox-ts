import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { makeSetStatement, removeBalancedParenthesisFromStringBorders } from "../utility/general";
import {
	getType,
	is0TypeLax,
	isBoolishTypeLax,
	isFalsyStringTypeLax,
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
	console.log(8, node.getText());
	let id: string | undefined;
	const currentConditionalContext = state.currentConditionalContext;
	// let isPushed = false;
	const declaration = state.declarationContext.get(node);

	if (declaration) {
		if (declaration.needsLocalizing) {
			state.pushPrecedingStatements(node, state.indent + `local `);
		}

		state.currentConditionalContext = id = declaration.set;
		state.declarationContext.delete(node);
	} else {
		if (currentConditionalContext === "") {
			state.currentConditionalContext = id = state.pushPrecedingStatementToNewId(node, "");
			// isPushed = true;
		} else {
			id = currentConditionalContext;
		}
	}

	const truthyData = getTruthyCompileData(state, lhs, true);
	console.log(9, id, (id = truthyData.expStr));
	const conditionStr = compileTruthyCheck(state, lhs, truthyData);

	state.pushPrecedingStatements(lhs, state.indent + `if ${isAnd ? "" : "not "}${conditionStr} then\n`);
	state.pushIdStack();
	state.pushIndent();
	const rhsStr = compileExpression(state, rhs);
	state.pushPrecedingStatements(lhs, makeSetStatement(state, id, rhsStr));
	state.popIdStack();
	state.popIndent();
	state.pushPrecedingStatements(lhs, state.indent + `end;\n`);

	return id;
}

export function getTruthyCompileData(state: CompilerState, exp: ts.Expression, pushy = false) {
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

	console.log(0, exp.getText(), state.currentConditionalContext);

	let expStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, exp));

	if (expStr !== state.currentConditionalContext) {
		state.pushPrecedingStatements(exp, state.indent + `${state.currentConditionalContext} = ${expStr};\n`);
		expStr = state.currentConditionalContext;
	}

	const currentConditionalContext = state.currentConditionalContext;

	console.log(1, expStr, exp.getText(), currentConditionalContext);

	if (
		!isValidLuaIdentifier(expStr) &&
		Number(checkNaN) + Number(checkNon0) + Number(checkEmptyString) + Number(checkTruthy) > 1
	) {
		console.log(2, state.currentBinaryLogicContext, exp.getText());
		if (state.currentBinaryLogicContext) {
			state.pushPrecedingStatements(exp, state.indent + `::${state.currentBinaryLogicContext} = ${expStr};\n`);
			expStr = state.currentBinaryLogicContext;
		} else {
			state.currentBinaryLogicContext = expStr = state.pushPrecedingStatementToNewId(exp, expStr);
		}
		console.log(3, expStr, exp.getText());
	}

	return { expStr, checkNon0, checkNaN, checkEmptyString, checkTruthy } as const;
}

export function compileTruthyCheck(
	state: CompilerState,
	exp: ts.Expression,
	compileData = getTruthyCompileData(state, exp),
) {
	const { expStr, checkNon0, checkNaN, checkEmptyString, checkTruthy } = compileData;
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
