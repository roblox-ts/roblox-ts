import * as ts from "ts-morph";
import { transpileExpression } from ".";
import { CompilerState } from "../CompilerState";

export function transpileAwaitExpression(state: CompilerState, node: ts.AwaitExpression) {
	const expStr = transpileExpression(state, node.getExpression());
	state.usesTSLibrary = true;
	return `TS.await(${expStr})`;
}
