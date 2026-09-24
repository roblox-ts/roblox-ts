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
	parentId: luau.IndexableExpression,
	receiverType: ts.Type,
	name: ts.PropertyName,
) => {
	const memberType = state.getType(name);
	addIndexDiagnostics(state, name, memberType, receiverType);

	// NoSubstitutionTemplateLiteral is part of ts.PropertyName but TS rejects it as a binding key
	// (TS1180/TS1136), so it can never reach here
	assert(!ts.isNoSubstitutionTemplateLiteral(name));

	if (isMixedStringType(receiverType)) {
		DiagnosticService.addDiagnostic(errors.noMixedStringIndex(name));
		return { key: luau.none(), value: luau.none() };
	}

	if (ts.isPrivateIdentifier(name)) {
		DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(name));
		return { key: luau.none(), value: luau.none() };
	}

	if (ts.isIdentifier(name)) {
		return { key: luau.string(name.text), value: luau.property(parentId, name.text) };
	}

	const keyNode = ts.isComputedPropertyName(name) ? name.expression : name;
	let key = transformExpression(state, prereqs, keyNode);
	if (ts.isComputedPropertyName(name) && !luau.isSimplePrimitive(key)) {
		// computed keys are evaluated before assignment targets and reused by object rest
		key = prereqs.pushToVar(key, "key");
	}

	if (isDefinitelyType(receiverType, isStringType)) {
		return {
			key,
			value: createStringIndexExpression(
				prereqs,
				parentId,
				{ expression: key, prereqs: luau.list.make() },
				ts.isStringLiteral(keyNode)
					? state.typeChecker.getStringLiteralType(keyNode.text)
					: state.getType(keyNode),
			),
		};
	}

	key = addOneIfArrayType(state, receiverType, key);
	return { key, value: luau.create(luau.SyntaxKind.ComputedIndexExpression, { expression: parentId, index: key }) };
};
