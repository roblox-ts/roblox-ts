import ts from "byots";
import { TransformState } from "TSTransformer";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";

export function transformStringLiteral(
	state: TransformState,
	node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
) {
	return createStringFromLiteral(node);
}
