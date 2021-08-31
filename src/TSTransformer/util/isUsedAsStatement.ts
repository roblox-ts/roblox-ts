import { skipUpwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function isUsedAsStatement(expression: ts.Expression) {
	const parent = skipUpwards(expression).parent;
	return ts.isExpressionStatement(parent) || ts.isForStatement(parent);
}
