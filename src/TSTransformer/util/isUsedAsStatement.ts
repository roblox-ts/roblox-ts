import { skipUpwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function isUsedAsStatement(expression: ts.Expression): boolean {
	const parent = skipUpwards(expression).parent;
	return (
		ts.isExpressionStatement(parent) ||
		ts.isForStatement(parent) ||
		(ts.isDeleteExpression(parent) && isUsedAsStatement(parent))
	);
}
