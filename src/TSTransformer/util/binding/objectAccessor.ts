import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";

export const objectAccessor = (
	state: TransformState,
	parentId: luau.AnyIdentifier,
	accessType: ts.Type | ReadonlyArray<ts.Type>,
	name: ts.Node,
): luau.Expression => {
	if (ts.isIdentifier(name)) {
		return luau.create(luau.SyntaxKind.PropertyAccessExpression, {
			expression: parentId,
			name: name.text,
		});
	} else if (ts.isComputedPropertyName(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: addOneIfArrayType(state, accessType, transformExpression(state, name.expression)),
		});
	} else if (ts.isNumericLiteral(name) || ts.isStringLiteral(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: transformExpression(state, name),
		});
	}
	assert(false);
};
