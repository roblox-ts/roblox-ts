import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/util/transformStatementList";
import ts from "typescript";

export function transformSourceFile(state: TransformState, node: ts.SourceFile) {
	return transformStatementList(state, node.statements);
}
