import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerState } from "../class/TranspilerState";

export function transpileAwaitExpression(state: TranspilerState, node: ts.AwaitExpression) {
	const expStr = transpileExpression(state, node.getExpression());
	return `TS.await(${expStr})`;
}
