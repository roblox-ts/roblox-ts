import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformSpreadElementNoCheck } from "TSTransformer/nodes/expressions/transformSpreadElement";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { createArrayPointer, disableArrayInline } from "TSTransformer/util/pointer";
import { selectLengthCall, varArgsLiteral } from "TSTransformer/util/varArgsOptimization";
import ts from "typescript";

export function transformArrayLiteralExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.ArrayLiteralExpression,
) {
	const index = node.elements.findIndex(ts.isSpreadElement);
	/* We can just return an array if there are no spread elements or if the spread is the last element. Compilation examples:
	  [1, ...args] -> {1, ...}           -- if optimizable
	  [1, ...args] -> {1, unpack(args)}  -- otherwise
	*/
	if (index === -1 || index === node.elements.length - 1) {
		return luau.array(ensureTransformOrder(state, prereqs, node.elements));
	}

	/* Examples:
	  [1, ...args, 2] -> {1, ...args}, then append '2'
	  [1, ...otherArgs, ...args] -> {1, unpack(otherArgs)}, then move args
	After the initial array construction, if 'args' is optimizable, use a select loop; otherwise use table.move
	*/

	const ptr = createArrayPointer("array");
	const lengthId = luau.tempId("length");
	let amtElementsSinceUpdate = 0;

	let lengthInitialized = false;

	function updateLengthId() {
		const right = luau.unary("#", ptr.value);
		if (lengthInitialized) {
			prereqs.push(
				luau.create(luau.SyntaxKind.Assignment, {
					left: lengthId,
					operator: "=",
					right,
				}),
			);
		} else {
			prereqs.push(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: lengthId,
					right,
				}),
			);
			lengthInitialized = true;
		}
		amtElementsSinceUpdate = 0;
	}

	for (let i = 0; i < node.elements.length; i++) {
		const element = node.elements[i];
		if (ts.isSpreadElement(element)) {
			if (luau.isArray(ptr.value)) {
				// Add result of spread to array, then convert to non-array for remainder
				// (Note: technically transformSpreadElement can result in a non-spread if it's a spread of a constant array, but we don't deal with that here)
				const expression = transformSpreadElementNoCheck(state, prereqs, element);
				luau.list.push(ptr.value.members, expression);

				disableArrayInline(prereqs, ptr);
				updateLengthId();
				continue;
			}
			assert(luau.isAnyIdentifier(ptr.value));

			const varArgsData = state.getOptimizableVarArgsData(element.expression);
			if (varArgsData) {
				/* Desired output:
				for i = 1, _args_length do -- or select("#", ...)
					_array[_length + i] = select(i, ...)
				end
				*/
				let index = luau.binary(lengthId, "+", luau.id("i"));
				if (amtElementsSinceUpdate > 0) {
					index = luau.binary(index, "+", luau.number(amtElementsSinceUpdate));
				}
				const inner = luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: ptr.value,
						index,
					}),
					operator: "=",
					right: luau.call(luau.globals.select, [luau.id("i"), varArgsLiteral]),
				});

				prereqs.push(
					luau.create(luau.SyntaxKind.NumericForStatement, {
						id: luau.id("i"),
						start: luau.number(1),
						step: undefined,
						end: varArgsData.lengthId ?? selectLengthCall,
						statements: luau.list.make(inner),
					}),
				);
				if (i < node.elements.length - 1) {
					updateLengthId();
				}
			} else {
				const type = state.getType(element.expression);
				const addIterableToArrayBuilder = getAddIterableToArrayBuilder(state, element.expression, type);
				const spreadExp = transformExpression(state, prereqs, element.expression);
				const shouldUpdateLengthId = i < node.elements.length - 1;
				prereqs.pushList(
					addIterableToArrayBuilder(
						prereqs,
						spreadExp,
						ptr.value,
						lengthId,
						amtElementsSinceUpdate,
						shouldUpdateLengthId,
					),
				);
			}
		} else {
			const expressionPrereqs = new Prereqs();
			const expression = transformExpression(state, expressionPrereqs, element);
			if (luau.isArray(ptr.value) && !luau.list.isEmpty(expressionPrereqs.statements)) {
				disableArrayInline(prereqs, ptr);
				updateLengthId();
			}
			if (luau.isArray(ptr.value)) {
				luau.list.push(ptr.value.members, expression);
			} else {
				prereqs.pushList(expressionPrereqs.statements);
				prereqs.push(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: ptr.value,
							index: luau.binary(lengthId, "+", luau.number(amtElementsSinceUpdate + 1)),
						}),
						operator: "=",
						right: expression,
					}),
				);
			}
			amtElementsSinceUpdate++;
		}
	}

	return ptr.value;
}
