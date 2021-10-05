import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { getKindName } from "TSTransformer/util/getKindName";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import ts from "typescript";

export const objectAccessor = (
	state: TransformState,
	parentId: luau.AnyIdentifier,
	accessType: ts.Type | ReadonlyArray<ts.Type>,
	name:
		| ts.Identifier
		| ts.ComputedPropertyName
		| ts.NumericLiteral
		| ts.StringLiteral
		| ts.PrivateIdentifier
		| ts.BindingPattern,
): luau.Expression => {
	const symbol = getFirstDefinedSymbol(state, state.getType(name));
	if (symbol && state.services.macroManager.getPropertyCallMacro(symbol)) {
		DiagnosticService.addDiagnostic(errors.noIndexWithoutCall(name.parent));
	}
	if (ts.isIdentifier(name)) {
		return luau.property(parentId, name.text);
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
	} else {
		assert(false, `Uncaught node kind ${getKindName(name.kind)} in objectAccessor`);
	}
};
