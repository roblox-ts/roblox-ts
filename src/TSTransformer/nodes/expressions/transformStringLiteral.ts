import { TransformState } from "TSTransformer";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";
import ts from "typescript";

export function transformStringLiteral(state: TransformState, node: ts.StringLiteral) {
	return createStringFromLiteral(node);
}
