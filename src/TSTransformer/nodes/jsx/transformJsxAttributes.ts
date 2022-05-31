import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	CHANGE_ATTRIBUTE_NAME,
	EVENT_ATTRIBUTE_NAME,
	KEY_ATTRIBUTE_NAME,
	REF_ATTRIBUTE_NAME,
} from "TSTransformer/util/jsx/constants";
import { createRoactIndex } from "TSTransformer/util/jsx/createRoactIndex";
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
		expression: luau.call(luau.globals.pairs, [expression]),
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

function isFlatObject(expression: ts.ObjectLiteralExpression) {
	for (const property of expression.properties) {
		if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
			return false;
		}
	}
	return true;
}

function transformSpecialAttribute(state: TransformState, attribute: ts.JsxAttribute, attributesPtr: MapPointer) {
	assert(attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression);
	const expression = attribute.initializer.expression;
	if (ts.isObjectLiteralExpression(expression) && isFlatObject(expression)) {
		for (const property of expression.properties) {
			assert(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name));
			const [init, initPrereqs] = transformJsxInitializer(state, property.initializer);
			if (!luau.list.isEmpty(initPrereqs)) {
				disableMapInline(state, attributesPtr);
			}
			state.prereqList(initPrereqs);
			assignToMapPointer(state, attributesPtr, createRoactIndex(attribute.name.text, property.name.text), init);
		}
	} else {
		disableMapInline(state, attributesPtr);

		const init = transformExpression(state, expression);
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: luau.call(luau.globals.pairs, [init]),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: attributesPtr.value,
							index: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: createRoactIndex(attribute.name.text),
								index: keyId,
							}),
						}),
						operator: "=",
						right: valueId,
					}),
				),
			}),
		);
	}
}

function isSpecialAttribute(state: TransformState, attribute: ts.JsxAttribute) {
	assert(state.services.roactSymbolManager);
	const contextualType = state.typeChecker.getContextualType(attribute.parent);
	if (contextualType) {
		const symbol = contextualType.getProperty(attribute.name.text);
		if (symbol) {
			const targetSymbol = ts.getSymbolTarget(symbol, state.typeChecker);
			if (
				targetSymbol === state.services.roactSymbolManager.getSymbolOrThrow(EVENT_ATTRIBUTE_NAME) ||
				targetSymbol === state.services.roactSymbolManager.getSymbolOrThrow(CHANGE_ATTRIBUTE_NAME)
			) {
				return true;
			}
		}
	}
	return false;
}

function transformJsxAttribute(state: TransformState, attribute: ts.JsxAttribute, attributesPtr: MapPointer) {
	const attributeName = attribute.name.text;
	if (attributeName === KEY_ATTRIBUTE_NAME) return;

	if (isSpecialAttribute(state, attribute)) {
		transformSpecialAttribute(state, attribute, attributesPtr);
		return;
	}

	const [init, initPrereqs] = transformJsxInitializer(state, attribute.initializer);
	if (!luau.list.isEmpty(initPrereqs)) {
		disableMapInline(state, attributesPtr);
		state.prereqList(initPrereqs);
	}

	const name =
		attributeName === REF_ATTRIBUTE_NAME ? createRoactIndex(REF_ATTRIBUTE_NAME) : luau.string(attributeName);
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
