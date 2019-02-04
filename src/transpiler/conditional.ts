import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerState } from "../TranspilerState";
import { isBooleanType, isNullableType } from "../typeUtilities";

export function transpileConditionalExpression(state: TranspilerState, node: ts.ConditionalExpression) {
	const conditionStr = transpileExpression(state, node.getCondition());
	const trueStr = transpileExpression(state, node.getWhenTrue());
	const falseStr = transpileExpression(state, node.getWhenFalse());
	const trueType = node.getWhenTrue().getType();
	if (isNullableType(trueType) || isBooleanType(trueType)) {
		return `(${conditionStr} and function() return ${trueStr} end or function() return ${falseStr} end)()`;
	} else {
		return `(${conditionStr} and ${trueStr} or ${falseStr})`;
	}
}
