import ts from "typescript";
import { TransformState } from "../TransformState";
import { transformStatement } from "./statement";

export function transformSourceFile(state: TransformState, node: ts.SourceFile) {
	for (const statement of node.statements) {
		transformStatement(state, statement);
	}
}
