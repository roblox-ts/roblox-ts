import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { isBooleanType, isNullableType } from "../typeUtilities";

export function compileConditionalExpression(state: CompilerState, node: ts.ConditionalExpression) {
	const conditionStr = compileExpression(state, node.getCondition());
	const trueStr = compileExpression(state, node.getWhenTrue());
	const falseStr = compileExpression(state, node.getWhenFalse());
	const trueType = node.getWhenTrue().getType();
	if (isNullableType(trueType) || isBooleanType(trueType)) {
		return `(${conditionStr} and function() return ${trueStr} end or function() return ${falseStr} end)()`;
	} else {
		return `(${conditionStr} and ${trueStr} or ${falseStr})`;
	}
}
