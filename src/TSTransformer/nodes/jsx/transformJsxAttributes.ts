import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { getAttributeNameText } from "TSTransformer/util/jsx/getAttributeName";
import { assignToMapPointer, disableMapInline, MapPointer } from "TSTransformer/util/pointer";
import { isPossiblyType, isUndefinedType } from "TSTransformer/util/types";
import ts from "typescript";

function transformJsxInitializer(
	state: TransformState,
	initializer: ts.Expression | undefined,
): [node: luau.Expression, prereqs: luau.List<luau.Statement>] {
	if (initializer && ts.isJsxExpression(initializer)) {
		initializer = initializer.expression;
	}
	if (initializer) {
		return state.capture(() => transformExpression(state, initializer!));
	} else {
		return [luau.bool(true), luau.list.make<luau.Statement>()];
	}
}

function createJsxAttributeLoop(
	state: TransformState,
	attributesPtrValue: luau.AnyIdentifier,
	expression: luau.Expression,
	type: ts.Type,
) {
	const possiblyUndefined = isPossiblyType(type, isUndefinedType);
	if (possiblyUndefined) {
		expression = state.pushToVarIfComplex(expression, "attribute");
	}

	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");
	let statement: luau.Statement = luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression,
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: attributesPtrValue,
					index: keyId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});

	if (possiblyUndefined) {
		statement = luau.create(luau.SyntaxKind.IfStatement, {
			condition: expression,
			statements: luau.list.make(statement),
			elseBody: luau.list.make(),
		});
	}

	return statement;
}

function transformJsxAttribute(state: TransformState, attribute: ts.JsxAttribute, attributesPtr: MapPointer) {
	const [init, initPrereqs] = transformJsxInitializer(state, attribute.initializer);
	if (!luau.list.isEmpty(initPrereqs)) {
		disableMapInline(state, attributesPtr);
		state.prereqList(initPrereqs);
	}

	const name = luau.string(getAttributeNameText(attribute.name));
	assignToMapPointer(state, attributesPtr, name, init);
}

export function transformJsxAttributes(state: TransformState, attributes: ts.JsxAttributes, attributesPtr: MapPointer) {
	for (const attribute of attributes.properties) {
		if (ts.isJsxAttribute(attribute)) {
			transformJsxAttribute(state, attribute, attributesPtr);
		} else {
			// spread attributes
			disableMapInline(state, attributesPtr);
			const expression = transformExpression(state, attribute.expression);
			state.prereq(
				createJsxAttributeLoop(state, attributesPtr.value, expression, state.getType(attribute.expression)),
			);
		}
	}
}
