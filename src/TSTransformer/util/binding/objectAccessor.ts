import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addIndexDiagnostics } from "TSTransformer/util/addIndexDiagnostics";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { assertNever } from "TSTransformer/util/assertNever";
import ts from "typescript";

export const objectAccessor = (
	state: TransformState,
	parentId: luau.AnyIdentifier,
	type: ts.Type,
	name: ts.PropertyName,
): luau.Expression => {
	addIndexDiagnostics(state, name, state.getType(name));

	// NoSubstitutionTemplateLiteral is part of ts.PropertyName but TS rejects it as a binding key
	// (TS1180/TS1136), so it can never reach here
	assert(!ts.isNoSubstitutionTemplateLiteral(name));

	if (ts.isIdentifier(name)) {
		return luau.property(parentId, name.text);
	} else if (ts.isComputedPropertyName(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: addOneIfArrayType(state, type, transformExpression(state, name.expression)),
		});
	} else if (ts.isNumericLiteral(name) || ts.isStringLiteral(name) || ts.isBigIntLiteral(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: transformExpression(state, name),
		});
	} else if (ts.isPrivateIdentifier(name)) {
		DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(name));
		return luau.none();
	}
	return assertNever(name, "objectAccessor");
};
