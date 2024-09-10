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
		const [expression, index] = ensureTransformOrder(state, prereqs, [node.expression, node.argumentExpression]);
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

export function transformWritableAssignment(
	state: TransformState,
	prereqs: Prereqs,
	writeNode: ts.Expression,
	valueNode: ts.Expression,
	readAfterWrite = false,
	readBeforeWrite = false,
) {
	const writable = transformWritableExpression(state, prereqs, writeNode, readAfterWrite);
	const valuePrereqs = new Prereqs();
	const value = transformExpression(state, valuePrereqs, valueNode);

	// if !readBeforeWrite, readable won't be used anyways
	const readable =
		!readBeforeWrite || luau.list.isEmpty(valuePrereqs.statements)
			? writable
			: prereqs.pushToVar(writable, "readable");
	prereqs.prereqList(valuePrereqs.statements);

	return { writable, readable, value };
}
