import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { commutes, summarizeExpression, tagValueRegion } from "TSTransformer/util/effects";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
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
		// classify the write's base region (table writes cannot run user code; Instance
		// writes may fire Immediate-mode signal handlers)
		tagValueRegion(state, expression, node.expression);
		return luau.property(
			readAfterWrite ? state.pushToVarIfNonId(expression, "exp") : convertToIndexableExpression(expression),
			node.name.text,
		);
	} else if (ts.isElementAccessExpression(node)) {
		// ensureTransformOrder already tags the base's value region
		const [expression, index] = ensureTransformOrder(state, [node.expression, node.argumentExpression]);
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
	const writable = transformWritableExpression(state, writeNode, readAfterWrite);
	const [value, prereqs] = state.capture(() => transformExpression(state, valueNode));

	// TS reads a compound assignment's target before evaluating the value. The read must be
	// materialized when the value has prereq statements, and also when its inline code may
	// change what the read observes — Luau reads the target's register/field at the
	// consuming instruction, after the value's inline code has run (e.g. `a += f()` where
	// `f` reassigns `a`).
	const mustCaptureRead =
		readBeforeWrite &&
		(!luau.list.isEmpty(prereqs) ||
			!commutes(summarizeExpression(state, writable, writeNode), summarizeExpression(state, value, valueNode)));
	const readable = mustCaptureRead ? state.pushToVar(writable, "readable") : writable;
	state.prereqList(prereqs);

	return { writable, readable, value };
}
