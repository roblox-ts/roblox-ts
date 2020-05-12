import ts from "byots";
import { TransformState } from "TSTransformer/TransformState";
import { transformClassLikeDeclaration } from "TSTransformer/nodes/transformClassLikeDeclaration";

export function transformClassExpression(state: TransformState, node: ts.ClassExpression) {
	const { statements, name } = transformClassLikeDeclaration(state, node);
	state.prereqList(statements);
	return name;
}
