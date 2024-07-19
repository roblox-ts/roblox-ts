import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { assignToMapPointer, createMapPointer, disableMapInline, MapPointer } from "TSTransformer/util/pointer";
import { getFirstDefinedSymbol, isDefinitelyType, isObjectType } from "TSTransformer/util/types";
import { validateMethodAssignment } from "TSTransformer/util/validateMethodAssignment";
import ts from "typescript";

function transformPropertyAssignment(
	state: TransformState,
	ptr: MapPointer,
	name: ts.PropertyName,
	initializer: ts.Expression,
) {
	let [left, leftPrereqs] = state.capture(() => transformPropertyName(state, name));
	const [right, rightPrereqs] = state.capture(() => transformExpression(state, initializer));

	if (!luau.list.isEmpty(leftPrereqs) || !luau.list.isEmpty(rightPrereqs)) {
		disableMapInline(state, ptr);
		state.prereqList(leftPrereqs);
		left = state.pushToVar(left, "left");
	}

	state.prereqList(rightPrereqs);

	assignToMapPointer(state, ptr, left, right);
}

function transformSpreadAssignment(state: TransformState, ptr: MapPointer, property: ts.SpreadAssignment) {
	const expType = state.typeChecker.getNonOptionalType(state.getType(property.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol && state.services.macroManager.isMacroOnlyClass(symbol)) {
		DiagnosticService.addDiagnostic(errors.noMacroObjectSpread(property));
	}

	const type = state.getType(property.expression);
	const definitelyObject = isDefinitelyType(type, isObjectType);

	if (definitelyObject && luau.isMap(ptr.value) && luau.list.isEmpty(ptr.value.fields)) {
		ptr.value = state.pushToVar(
			luau.call(luau.globals.table.clone, [transformExpression(state, property.expression)]),
			ptr.name,
		);
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				// Explicitly remove metatable because things like classes can be spread
				expression: luau.call(luau.globals.setmetatable, [ptr.value, luau.nil()]),
			}),
		);
		return;
	}

	disableMapInline(state, ptr);
	let spreadExp = transformExpression(state, property.expression);
	if (!definitelyObject) {
		spreadExp = state.pushToVarIfComplex(spreadExp, "spread");
	}

	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");
	let statement: luau.Statement = luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: spreadExp,
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: ptr.value,
					index: keyId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});

	if (!definitelyObject) {
		statement = luau.create(luau.SyntaxKind.IfStatement, {
			condition: createTruthinessChecks(state, spreadExp, property.expression),
			statements: luau.list.make(statement),
			elseBody: luau.list.make(),
		});
	}

	state.prereq(statement);
}

export function transformObjectLiteralExpression(state: TransformState, node: ts.ObjectLiteralExpression) {
	// starts as luau.Map, becomes luau.TemporaryIdentifier when `disableInline` is called
	const ptr = createMapPointer("object");
	for (const property of node.properties) {
		validateMethodAssignment(state, property);
		if (ts.isPropertyAssignment(property)) {
			if (ts.isPrivateIdentifier(property.name)) {
				DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(property.name));
				continue;
			}
			transformPropertyAssignment(state, ptr, property.name, property.initializer);
		} else if (ts.isShorthandPropertyAssignment(property)) {
			transformPropertyAssignment(state, ptr, property.name, property.name);
		} else if (ts.isSpreadAssignment(property)) {
			transformSpreadAssignment(state, ptr, property);
		} else if (ts.isMethodDeclaration(property)) {
			state.prereqList(transformMethodDeclaration(state, property, ptr));
		} else {
			// must be ts.AccessorDeclaration, which is banned
			DiagnosticService.addDiagnostic(errors.noGetterSetter(property));
		}
	}
	return ptr.value;
}
