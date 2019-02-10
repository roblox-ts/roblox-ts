import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { TranspilerState } from "../TranspilerState";

export function transpileAwaitExpression(state: TranspilerState, node: ts.AwaitExpression) {
	const expStr = transpileExpression(state, node.getExpression());
	state.usesTSLibrary = true;
	return `TS.await(${expStr})`;
}
