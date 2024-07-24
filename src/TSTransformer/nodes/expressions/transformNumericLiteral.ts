import luau from "@roblox-ts/luau-ast";
import ts from "typescript";

export function transformNumericLiteral(node: ts.NumericLiteral) {
	return luau.create(luau.SyntaxKind.NumberLiteral, {
		value: node.getText(),
	});
}
