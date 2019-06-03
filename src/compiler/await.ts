/* istanbul ignore file */

import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";

export function compileAwaitExpression(state: CompilerState, node: ts.AwaitExpression) {
	const expStr = compileExpression(state, node.getExpression());
	state.usesTSLibrary = true;
	return `TS.await(${expStr})`;
}
