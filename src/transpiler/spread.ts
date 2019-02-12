import * as ts from "ts-morph";
import { getFirstMemberWithParameters, transpileExpression } from ".";
import { TranspilerState } from "../TranspilerState";
import { checkNonAny } from "./security";

export function transpileSpreadElement(state: TranspilerState, node: ts.SpreadElement) {
	const expression = node.getExpression();
	checkNonAny(expression, true);
	const expStr = transpileExpression(state, expression);
	const parentFunction = getFirstMemberWithParameters(node.getAncestors());
	if (parentFunction && state.canOptimizeParameterTuple.get(parentFunction) === expStr) {
		return "...";
	} else {
		return `unpack(${expStr})`;
	}
}
