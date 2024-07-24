import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addIndexDiagnostics } from "TSTransformer/util/addIndexDiagnostics";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { assertNever } from "TSTransformer/util/assertNever";
import ts from "typescript";

export const objectAccessor = (
	state: TransformState,
	prereqs: Prereqs,
	parentId: luau.AnyIdentifier,
	type: ts.Type,
	name: ts.PropertyName,
): luau.Expression => {
	addIndexDiagnostics(state, name, state.getType(name));

	if (ts.isIdentifier(name)) {
		return luau.property(parentId, name.text);
	} else if (ts.isComputedPropertyName(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: addOneIfArrayType(state, type, transformExpression(state, prereqs, name.expression)),
		});
	} else if (ts.isNumericLiteral(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: transformExpression(state, prereqs, name),
		});
	} else if (ts.isPrivateIdentifier(name)) {
		DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(name));
		return luau.none();
	}
	return assertNever(name, "objectAccessor");
};
