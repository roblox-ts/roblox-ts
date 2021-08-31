import ts from "typescript";
import { skipUpwards } from "TSTransformer/util/traversal";

export function isUsedAsStatement(expression: ts.Expression) {
	const parent = skipUpwards(expression).parent;
	return ts.isExpressionStatement(parent) || ts.isForStatement(parent);
}
