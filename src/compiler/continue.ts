import * as ts from "ts-morph";
import { CompilerState } from "../CompilerState";

export function compileContinueStatement(state: CompilerState, node: ts.ContinueStatement) {
	return state.indent + `_continue_${state.continueId} = true; break;\n`;
}
