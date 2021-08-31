import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export function transformNumericLiteral(state: TransformState, node: ts.NumericLiteral) {
	return luau.create(luau.SyntaxKind.NumberLiteral, {
		value: node.getText(),
	});
}
