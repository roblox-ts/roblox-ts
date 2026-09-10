import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import {
	effectsCommute,
	EvaluationEffects,
	getEffects,
	isLateRead,
	joinEffects,
	NO_EFFECTS,
} from "TSTransformer/util/evaluation/effects";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformWritableExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.Expression,
	readAfterWrite: boolean,
): luau.WritableExpression {
	if (ts.isPrototypeAccess(node)) {
		DiagnosticService.addDiagnostic(errors.noPrototype(node));
	}
	if (ts.isPropertyAccessExpression(node)) {
		const expression = transformExpression(state, prereqs, node.expression);
		return luau.property(
			readAfterWrite ? prereqs.pushToVarIfNonId(expression, "exp") : convertToIndexableExpression(expression),
			node.name.text,
		);
	} else if (ts.isElementAccessExpression(node)) {
		let [expression, index] = ensureTransformOrder(state, prereqs, [node.expression, node.argumentExpression]);
		if (isLateRead(expression) && !effectsCommute(getEffects(expression), getEffects(index))) {
			expression = prereqs.pushToVar(expression, "exp");
		}
		const indexExp = addOneIfArrayType(state, state.getType(node.expression), index);
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: readAfterWrite
				? prereqs.pushToVarIfNonId(expression, "exp")
				: convertToIndexableExpression(expression),
			index: readAfterWrite ? prereqs.pushToVarIfComplex(indexExp, "index") : indexExp,
		});
	} else {
		const transformed = transformExpression(state, prereqs, skipDownwards(node));
		assert(luau.isWritableExpression(transformed));
		return transformed;
	}
}

export function captureWritableAssignmentTarget(
	prereqs: Prereqs,
	writable: luau.WritableExpression,
	prereqEffects: EvaluationEffects,
	valueEffects: EvaluationEffects,
) {
	// Luau evaluates complex bases and keys before an inline RHS, but can read
	// locals at the store instruction; hoisted prerequisites precede both
	const intervening = (expression: luau.Expression) =>
		joinEffects(prereqEffects, isLateRead(expression) ? valueEffects : NO_EFFECTS);
	if (!luau.isAnyIdentifier(writable)) {
		const base = writable.expression;
		const index = luau.isComputedIndexExpression(writable) ? writable.index : undefined;
		const captureIndex = index !== undefined && !effectsCommute(getEffects(index), intervening(index));
		const baseEffects = captureIndex ? joinEffects(intervening(base), getEffects(index)) : intervening(base);
		const stableBase = !effectsCommute(getEffects(base), baseEffects) ? prereqs.pushToVar(base, "exp") : base;
		if (luau.isComputedIndexExpression(writable)) {
			writable = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: stableBase,
				index: captureIndex ? prereqs.pushToVar(writable.index, "index") : writable.index,
			});
		} else {
			writable = luau.property(stableBase, writable.name);
		}
	}
	return writable;
}

export function transformWritableAssignment(
	state: TransformState,
	prereqs: Prereqs,
	writeNode: ts.Expression,
	valueNode: ts.Expression,
	readAfterWrite = false,
	readBeforeWrite = false,
) {
	let writable = transformWritableExpression(state, prereqs, writeNode, readAfterWrite);
	const valuePrereqs = new Prereqs();
	const value = transformExpression(state, valuePrereqs, valueNode);
	const prereqEffects = getEffects(valuePrereqs.statements);
	const valueEffects = getEffects(value);
	const effects = joinEffects(prereqEffects, valueEffects);
	writable = captureWritableAssignmentTarget(prereqs, writable, prereqEffects, valueEffects);
	// the assignment target and its old value may need separate snapshots
	const readable =
		readBeforeWrite && !effectsCommute(getEffects(writable), effects)
			? prereqs.pushToVar(writable, "readable")
			: writable;
	prereqs.pushList(valuePrereqs.statements);

	return { writable, readable, value };
}
