import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
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
		return luau.property(
			readAfterWrite ? state.pushToVarIfNonId(expression, "exp") : convertToIndexableExpression(expression),
			node.name.text,
		);
	} else if (ts.isElementAccessExpression(node)) {
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

	// if !readBeforeWrite, readable won't be used anyways
	const readable = !readBeforeWrite || luau.list.isEmpty(prereqs) ? writable : state.pushToVar(writable, "readable");
	state.prereqList(prereqs);

	return { writable, readable, value };
}
