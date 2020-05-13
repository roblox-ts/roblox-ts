import ts from "byots";
import { skipUpwards } from "TSTransformer/util/traversal";

export function isUsedAsStatement(expression: ts.Expression) {
	const parent = skipUpwards(expression).parent;
	return ts.isExpressionStatement(parent) || ts.isForStatement(parent);
}
