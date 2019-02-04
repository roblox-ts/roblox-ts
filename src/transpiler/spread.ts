import * as ts from "ts-morph";
import { getFirstMemberWithParameters, transpileExpression } from ".";
import { TranspilerState } from "../TranspilerState";

export function transpileSpreadElement(state: TranspilerState, node: ts.SpreadElement) {
	const expStr = transpileExpression(state, node.getExpression());
	const parentFunction = getFirstMemberWithParameters(node.getAncestors());
	if (parentFunction && state.canOptimizeParameterTuple.get(parentFunction) === expStr) {
		return "...";
	} else {
		return `unpack(${expStr})`;
	}
}
