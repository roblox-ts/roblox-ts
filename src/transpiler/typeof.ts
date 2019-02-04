import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerState } from "../class/TranspilerState";

export function transpileTypeOfExpression(state: TranspilerState, node: ts.TypeOfExpression) {
	const expStr = transpileExpression(state, node.getExpression());
	return `TS.typeof(${expStr})`;
}
