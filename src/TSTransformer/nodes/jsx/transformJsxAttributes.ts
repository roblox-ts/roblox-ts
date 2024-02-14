import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { assignToMapPointer, disableMapInline, MapPointer } from "TSTransformer/util/pointer";
import { getFirstDefinedSymbol, isDefinitelyType, isObjectType } from "TSTransformer/util/types";
import ts from "typescript";

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

	const text = ts.isIdentifier(attribute.name) ? attribute.name.text : ts.getTextOfJsxNamespacedName(attribute.name);
	const name = luau.string(text);
	assignToMapPointer(state, attributesPtr, name, init);
}

export function transformJsxAttributes(state: TransformState, attributes: ts.JsxAttributes, attributesPtr: MapPointer) {
	for (const attribute of attributes.properties) {
		if (ts.isJsxAttribute(attribute)) {
			transformJsxAttribute(state, attribute, attributesPtr);
		} else {
			// spread attributes: `<frame { ...x }/>`

			const expType = state.typeChecker.getNonOptionalType(state.getType(attribute.expression));
			const symbol = getFirstDefinedSymbol(state, expType);
			if (symbol && state.services.macroManager.isMacroOnlyClass(symbol)) {
				DiagnosticService.addDiagnostic(errors.noMacroObjectSpread(attribute));
			}

			const expression = transformExpression(state, attribute.expression);

			if (attribute === attributes.properties[0] && isDefinitelyType(expType, isObjectType)) {
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
