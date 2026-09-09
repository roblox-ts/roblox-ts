import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addIndexDiagnostics } from "TSTransformer/util/addIndexDiagnostics";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { createStringIndexExpression } from "TSTransformer/util/createStringIndexExpression";
import { tryMarkBuiltinMember } from "TSTransformer/util/evaluation/builtins";
import { effectsCommute, getEffects, isLateRead, joinEffects, NO_EFFECTS } from "TSTransformer/util/evaluation/effects";
import { getConstantValueLiteral } from "TSTransformer/util/getConstantValueLiteral";
import { offset } from "TSTransformer/util/offset";
import { skipUpwards } from "TSTransformer/util/traversal";
import { isDefinitelyType, isLuaTupleType, isMixedStringType, isStringType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformElementAccessExpressionInner(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.ElementAccessExpression,
	expression: luau.Expression,
	argumentExpression: ts.Expression,
) {
	// a in a[b]
	validateNotAnyType(state, node.expression);
	// b in a[b]
	validateNotAnyType(state, node.argumentExpression);

	const receiverType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const memberType = state.typeChecker.getNonOptionalType(state.getType(node));
	addIndexDiagnostics(state, node, memberType, receiverType);

	const indexPrereqs = new Prereqs();
	const index = transformExpression(state, indexPrereqs, argumentExpression);

	// optional chains already guard this access against nil
	const nonNullableType = state.typeChecker.getNonNullableType(expType);
	if (isDefinitelyType(nonNullableType, isStringType)) {
		return createStringIndexExpression(
			prereqs,
			expression,
			{ expression: index, prereqs: indexPrereqs.statements },
			state.getType(argumentExpression),
		);
	}
	if (isMixedStringType(nonNullableType)) {
		DiagnosticService.addDiagnostic(errors.noMixedStringIndex(node));
		return luau.none();
	}

	if (
		!effectsCommute(
			getEffects(expression),
			joinEffects(getEffects(indexPrereqs.statements), isLateRead(expression) ? getEffects(index) : NO_EFFECTS),
		)
	) {
		// hack because wrapReturnIfLuaTuple will not wrap this, but now we need to!
		if (isLuaTupleType(state)(receiverType)) {
			expression = luau.array([expression]);
		}

		expression = prereqs.pushToVar(expression, "exp");
	}
	prereqs.pushList(indexPrereqs.statements);

	// LuaTuple<T> checks
	if (luau.isCall(expression) && isLuaTupleType(state)(receiverType)) {
		// wrap in select() if it isn't the first value
		if (!luau.isNumberLiteral(index) || Number(index.value.replace(/_/g, "")) !== 0) {
			expression = luau.call(luau.globals.select, [offset(index, 1), expression]);
		}
		// parentheses to trim off the rest of the values
		return luau.create(luau.SyntaxKind.ParenthesizedExpression, { expression });
	}

	if (ts.isDeleteExpression(skipUpwards(node).parent)) {
		prereqs.push(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: convertToIndexableExpression(expression),
					index: addOneIfArrayType(state, receiverType, index),
				}),
				operator: "=",
				right: luau.nil(),
			}),
		);
		return luau.none();
	}

	const access = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
		expression: convertToIndexableExpression(expression),
		index: addOneIfArrayType(state, receiverType, index),
	});
	tryMarkBuiltinMember(state, node, access);
	return access;
}

export function transformElementAccessExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.ElementAccessExpression,
) {
	const constantValue = getConstantValueLiteral(state, node);
	if (constantValue) {
		return constantValue;
	}

	return transformOptionalChain(state, prereqs, node);
}
