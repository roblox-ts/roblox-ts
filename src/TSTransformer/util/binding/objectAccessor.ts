import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addIndexDiagnostics } from "TSTransformer/util/addIndexDiagnostics";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { createStringIndexExpression } from "TSTransformer/util/createStringIndexExpression";
import { isDefinitelyType, isMixedStringType, isStringType } from "TSTransformer/util/types";
import ts from "typescript";

export const objectAccessor = (
	state: TransformState,
	prereqs: Prereqs,
	parentId: luau.AnyIdentifier,
	receiverType: ts.Type,
	name: ts.PropertyName,
): luau.Expression => {
	const memberType = state.getType(name);
	addIndexDiagnostics(state, name, memberType, receiverType);

	// NoSubstitutionTemplateLiteral is part of ts.PropertyName but TS rejects it as a binding key
	// (TS1180/TS1136), so it can never reach here
	assert(!ts.isNoSubstitutionTemplateLiteral(name));

	if (isMixedStringType(receiverType)) {
		DiagnosticService.addDiagnostic(errors.noMixedStringIndex(name));
		return luau.none();
	}

	if (isDefinitelyType(receiverType, isStringType) && !ts.isIdentifier(name) && !ts.isPrivateIdentifier(name)) {
		const key = ts.isComputedPropertyName(name) ? name.expression : name;
		const indexPrereqs = new Prereqs();
		const index = transformExpression(state, indexPrereqs, key);
		return createStringIndexExpression(
			prereqs,
			parentId,
			{ expression: index, prereqs: indexPrereqs.statements },
			ts.isStringLiteral(key) ? state.typeChecker.getStringLiteralType(key.text) : state.getType(key),
		);
	}

	if (ts.isIdentifier(name)) {
		return luau.property(parentId, name.text);
	} else if (ts.isComputedPropertyName(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: addOneIfArrayType(state, receiverType, transformExpression(state, prereqs, name.expression)),
		});
	} else if (ts.isNumericLiteral(name) || ts.isStringLiteral(name) || ts.isBigIntLiteral(name)) {
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: parentId,
			index: transformExpression(state, prereqs, name),
		});
	}

	const privateName: ts.PrivateIdentifier = name;
	assert(ts.isPrivateIdentifier(privateName));
	DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(privateName));
	return luau.none();
};
