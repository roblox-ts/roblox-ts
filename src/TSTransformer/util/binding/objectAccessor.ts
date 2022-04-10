import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import ts from "typescript";

export const objectAccessor = (
	state: TransformState,
	parentId: luau.AnyIdentifier,
	type: ts.Type,
	name: ts.PropertyName,
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
			index: addOneIfArrayType(state, type, transformExpression(state, name.expression)),
		});
	} else if (ts.isNumericLiteral(name) || ts.isStringLiteral(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: transformExpression(state, name),
		});
	} else if (ts.isPrivateIdentifier(name)) {
		DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(name));
		return luau.none();
	}
	// Hack: This will throw a compile error if `name` has any uncovered variant
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return (name as [any])[0];
};
