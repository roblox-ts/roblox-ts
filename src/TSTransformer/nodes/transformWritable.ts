import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { effectsCommute, getEffects, isLateRead, joinEffects, NO_EFFECTS } from "TSTransformer/util/evaluation/effects";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformWritableExpression(
	state: TransformState,
	node: ts.Expression,
	readAfterWrite: boolean,
): luau.WritableExpression {
	if (ts.isPrototypeAccess(node)) {
		DiagnosticService.addDiagnostic(errors.noPrototype(node));
	}
	if (ts.isPropertyAccessExpression(node)) {
		const expression = transformExpression(state, node.expression);
		return luau.property(
			readAfterWrite ? state.pushToVarIfNonId(expression, "exp") : convertToIndexableExpression(expression),
			node.name.text,
		);
	} else if (ts.isElementAccessExpression(node)) {
		let [expression, index] = ensureTransformOrder(state, [node.expression, node.argumentExpression]);
		if (isLateRead(expression) && !effectsCommute(getEffects(expression), getEffects(index))) {
			expression = state.pushToVar(expression, "exp");
		}
		const indexExp = addOneIfArrayType(state, state.getType(node.expression), index);
		return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: readAfterWrite
				? state.pushToVarIfNonId(expression, "exp")
				: convertToIndexableExpression(expression),
			index: readAfterWrite ? state.pushToVarIfComplex(indexExp, "index") : indexExp,
		});
	} else {
		const transformed = transformExpression(state, skipDownwards(node));
		assert(luau.isWritableExpression(transformed));
		return transformed;
	}
}

export function transformWritableAssignment(
	state: TransformState,
	writeNode: ts.Expression,
	valueNode: ts.Expression,
	readAfterWrite = false,
	readBeforeWrite = false,
) {
	let writable = transformWritableExpression(state, writeNode, readAfterWrite);
	const [value, prereqs] = state.capture(() => transformExpression(state, valueNode));
	const prereqEffects = getEffects(prereqs);
	const valueEffects = getEffects(value);
	const effects = joinEffects(prereqEffects, valueEffects);
	// Luau evaluates complex bases and keys before an inline RHS, but can read
	// locals at the store instruction. Hoisted prerequisites precede both.
	const intervening = (expression: luau.Expression) =>
		joinEffects(prereqEffects, isLateRead(expression) ? valueEffects : NO_EFFECTS);
	// the assignment target and its old value may need separate snapshots
	if (!luau.isAnyIdentifier(writable)) {
		const base = writable.expression;
		const index = luau.isComputedIndexExpression(writable) ? writable.index : undefined;
		const captureIndex = index !== undefined && !effectsCommute(getEffects(index), intervening(index));
		const baseEffects = captureIndex ? joinEffects(intervening(base), getEffects(index)) : intervening(base);
		const stableBase = !effectsCommute(getEffects(base), baseEffects) ? state.pushToVar(base, "exp") : base;
		if (luau.isComputedIndexExpression(writable)) {
			writable = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: stableBase,
				index: captureIndex ? state.pushToVar(writable.index, "index") : writable.index,
			});
		} else {
			writable = luau.property(stableBase, writable.name);
		}
	}
	const readable =
		readBeforeWrite && !effectsCommute(getEffects(writable), effects)
			? state.pushToVar(writable, "readable")
			: writable;
	state.prereqList(prereqs);

	return { writable, readable, value };
}
