import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformClassLikeDeclaration } from "TSTransformer/nodes/class/transformClassLikeDeclaration";
import ts from "typescript";

export function transformClassExpression(state: TransformState, prereqs: Prereqs, node: ts.ClassExpression) {
	const { statements, name } = transformClassLikeDeclaration(state, node);
	prereqs.prereqList(statements);
	return name;
}
