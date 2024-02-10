import luau from "@roblox-ts/luau-ast";

// overloads prevent unnecessary calls to convertToIndexableExpression
// where the input expression is already an IndexableExpression
export function convertToIndexableExpression(expression: luau.IndexableExpression): void;
export function convertToIndexableExpression(expression: luau.Expression): luau.IndexableExpression;
export function convertToIndexableExpression(expression: luau.Expression): luau.IndexableExpression {
	if (luau.isIndexableExpression(expression)) {
		return expression;
	}
	return luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression });
}
