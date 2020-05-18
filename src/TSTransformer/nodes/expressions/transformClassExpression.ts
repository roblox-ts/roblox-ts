import ts from "byots";
import { TransformState } from "TSTransformer";
import { transformClassLikeDeclaration } from "TSTransformer/nodes/class/transformClassLikeDeclaration";

export function transformClassExpression(state: TransformState, node: ts.ClassExpression) {
	const { statements, name } = transformClassLikeDeclaration(state, node);
	state.prereqList(statements);
	return name;
}
