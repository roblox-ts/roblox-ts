import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayAssignmentPattern } from "TSTransformer/nodes/binding/transformArrayAssignmentPattern";
import { transformObjectAssignmentPattern } from "TSTransformer/nodes/binding/transformObjectAssignmentPattern";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { captureWritableAssignmentTarget, transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getEffects } from "TSTransformer/util/evaluation/effects";
import { getKindName } from "TSTransformer/util/getKindName";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformAssignmentPatternElement(
	state: TransformState,
	prereqs: Prereqs,
	target: ts.Expression,
	valuePrereqs: Prereqs,
	value: luau.Expression,
	initializer?: ts.Expression,
) {
	target = skipDownwards(target);
	if (ts.isBinaryExpression(target)) {
		initializer = skipDownwards(target.right);
		target = skipDownwards(target.left);
	}

	const nested = ts.isArrayLiteralExpression(target) || ts.isObjectLiteralExpression(target);
	if (nested || initializer) {
		const id = valuePrereqs.pushToVar(value, "binding");
		if (initializer) {
			valuePrereqs.push(transformInitializer(state, id, initializer));
		}
		value = id;
	}

	if (nested) {
		assert(luau.isAnyIdentifier(value));
		prereqs.pushList(valuePrereqs.statements);
		if (ts.isArrayLiteralExpression(target)) {
			transformArrayAssignmentPattern(state, prereqs, target, value);
		} else {
			assert(ts.isObjectLiteralExpression(target));
			transformObjectAssignmentPattern(state, prereqs, target, value);
		}
	} else {
		assert(
			ts.isIdentifier(target) || ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target),
			`Invalid destructuring assignment target: ${getKindName(target.kind)}`,
		);
		let id = transformWritableExpression(state, prereqs, target, false);
		id = captureWritableAssignmentTarget(prereqs, id, getEffects(valuePrereqs.statements), getEffects(value));
		prereqs.pushList(valuePrereqs.statements);
		prereqs.push(luau.create(luau.SyntaxKind.Assignment, { left: id, operator: "=", right: value }));
	}
}
