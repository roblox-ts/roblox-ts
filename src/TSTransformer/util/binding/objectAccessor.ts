import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
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
	preSpreadNames?: Array<ts.PropertyName>,
): luau.Expression => {
	addIndexDiagnostics(state, name, state.getType(name));
	if (preSpreadNames !== undefined) {
		const extracted = state.pushToVar(
			luau.set(
				preSpreadNames.map(name => {
					return luau.string(name.getText());
				}),
			),
			"extracted",
		);
		const rest = state.pushToVar(luau.map(), "rest");
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");

		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: parentId,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.unary(
							"not",
							luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: extracted,
								index: keyId,
							}),
						),
						elseBody: luau.list.make(),
						statements: luau.list.make(
							luau.create(luau.SyntaxKind.Assignment, {
								left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
									expression: rest,
									index: keyId,
								}),
								operator: "=",
								right: valueId,
							}),
						),
					}),
				),
			}),
		);
		return rest;
	} else if (ts.isIdentifier(name)) {
		return luau.property(parentId, name.text);
	} else if (ts.isComputedPropertyName(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: addOneIfArrayType(state, type, transformExpression(state, name.expression)),
		});
	} else if (ts.isNumericLiteral(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
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
