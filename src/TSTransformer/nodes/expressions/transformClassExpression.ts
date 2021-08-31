import { TransformState } from "TSTransformer";
import { transformClassLikeDeclaration } from "TSTransformer/nodes/class/transformClassLikeDeclaration";
import ts from "typescript";

export function transformClassExpression(state: TransformState, node: ts.ClassExpression) {
	const { statements, name } = transformClassLikeDeclaration(state, node);
	state.prereqList(statements);
	return name;
}
