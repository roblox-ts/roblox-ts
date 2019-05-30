import * as ts from "ts-morph";
import { CompilerState } from "../CompilerState";

export function compileBreakStatement(state: CompilerState, node: ts.BreakStatement) {
	return state.indent + "break;\n";
}
