import { TransformState } from "TSTransformer";
import { transformStatement } from "TSTransformer/nodes/statements/statement";
import ts from "typescript";

export function transformSourceFile(state: TransformState, node: ts.SourceFile) {
	for (const statement of node.statements) {
		transformStatement(state, statement);
	}
}
