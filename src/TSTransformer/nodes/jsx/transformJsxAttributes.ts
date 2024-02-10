import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks, willCreateTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getJsxNamespacedNameText } from "TSTransformer/util/jsx/getJsxNamespacedNameText";
import { assignToMapPointer, disableMapInline, MapPointer } from "TSTransformer/util/pointer";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import ts from "typescript";

function createJsxAttributeLoop(
	state: TransformState,
	attributesPtrValue: luau.AnyIdentifier,
	expression: luau.Expression,
	node: ts.Expression,
) {
	const type = state.getType(node);

	const symbol = getFirstDefinedSymbol(state, type);
	if (symbol && state.services.macroManager.isMacroOnlyClass(symbol)) {
		DiagnosticService.addDiagnostic(errors.noMacroObjectSpread(node));
	}

	const possiblyFalsy = willCreateTruthinessChecks(type);
	if (possiblyFalsy) {
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

	if (possiblyFalsy) {
		statement = luau.create(luau.SyntaxKind.IfStatement, {
			condition: createTruthinessChecks(state, expression, node),
			statements: luau.list.make(statement),
			elseBody: luau.list.make(),
		});
	}

	return statement;
}

function transformJsxAttribute(state: TransformState, attribute: ts.JsxAttribute, attributesPtr: MapPointer) {
	let initializer: ts.Expression | undefined = attribute.initializer;
	if (initializer && ts.isJsxExpression(initializer)) {
		initializer = initializer.expression;
	}

	const [init, initPrereqs] = initializer
		? state.capture(() => transformExpression(state, initializer!))
		: [luau.bool(true), luau.list.make<luau.Statement>()];

	if (!luau.list.isEmpty(initPrereqs)) {
		disableMapInline(state, attributesPtr);
		state.prereqList(initPrereqs);
	}

	const text = ts.isIdentifier(attribute.name) ? attribute.name.text : getJsxNamespacedNameText(attribute.name);
	const name = luau.string(text);
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
			state.prereq(createJsxAttributeLoop(state, attributesPtr.value, expression, attribute.expression));
		}
	}
}
