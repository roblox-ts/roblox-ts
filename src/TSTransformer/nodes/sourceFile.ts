import ts from "typescript";
import { TransformState } from "../TransformState";
import { compileStatement } from "./statement";

export function compileSourceFile(state: TransformState, node: ts.SourceFile) {
	for (const statement of node.statements) {
		compileStatement(state, statement);
	}
}
