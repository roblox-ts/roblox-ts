import ts from "byots";
import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";

export function transformSourceFile(state: TransformState, node: ts.SourceFile) {
	return transformStatementList(state, node.statements);
}
