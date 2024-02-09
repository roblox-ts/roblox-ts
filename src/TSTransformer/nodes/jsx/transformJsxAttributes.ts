import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import {
	CHANGE_ATTRIBUTE_NAME,
	EVENT_ATTRIBUTE_NAME,
	KEY_ATTRIBUTE_NAME,
	REF_ATTRIBUTE_NAME,
} from "TSTransformer/util/jsx/constants";
import { createRoactIndex } from "TSTransformer/util/jsx/createRoactIndex";
import { getAttributeNameText } from "TSTransformer/util/jsx/getAttributeName";
import { assignToMapPointer, disableMapInline, MapPointer } from "TSTransformer/util/pointer";
import { isDefinitelyType, isObjectType } from "TSTransformer/util/types";
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
	tsExpression: ts.Expression,
) {
	const definitelyObject = isDefinitelyType(state.getType(tsExpression), isObjectType);
	if (!definitelyObject) {
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

	if (!definitelyObject) {
		statement = luau.create(luau.SyntaxKind.IfStatement, {
			condition: createTruthinessChecks(state, expression, tsExpression),
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
			assignToMapPointer(
				state,
				attributesPtr,
				createRoactIndex(getAttributeNameText(attribute.name), property.name.text),
				init,
			);
		}
	} else {
		disableMapInline(state, attributesPtr);

		const init = transformExpression(state, expression);
		const keyId = luau.tempId("k");
		const valueId = luau.tempId("v");
		state.prereq(
			luau.create(luau.SyntaxKind.ForStatement, {
				ids: luau.list.make(keyId, valueId),
				expression: init,
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: attributesPtr.value,
							index: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: createRoactIndex(getAttributeNameText(attribute.name)),
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
		const symbol = contextualType.getProperty(getAttributeNameText(attribute.name));
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
	const attributeName = getAttributeNameText(attribute.name);
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
			// spread attributes: `<frame { ...x }/>`
			const expression = transformExpression(state, attribute.expression);

			if (
				attribute === attributes.properties[0] &&
				isDefinitelyType(state.getType(attribute.expression), isObjectType)
			) {
				attributesPtr.value = state.pushToVar(
					luau.call(luau.globals.table.clone, [expression]),
					attributesPtr.name,
				);
				state.prereq(
					luau.create(luau.SyntaxKind.CallStatement, {
						// Explicitly remove metatable because things like classes can be spread
						expression: luau.call(luau.globals.setmetatable, [attributesPtr.value, luau.nil()]),
					}),
				);
				continue;
			}

			disableMapInline(state, attributesPtr);
			state.prereq(createJsxAttributeLoop(state, attributesPtr.value, expression, attribute.expression));
		}
	}
}
