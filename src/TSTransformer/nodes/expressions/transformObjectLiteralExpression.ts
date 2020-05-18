import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { assignToPointer, Pointer } from "TSTransformer/util/pointer";

function disableInline(
	state: TransformState,
	ptr: Pointer<lua.Map | lua.TemporaryIdentifier>,
): asserts ptr is Pointer<lua.TemporaryIdentifier> {
	if (lua.isMap(ptr.value)) {
		ptr.value = state.pushToVar(ptr.value);
	}
}

function transformPropertyAssignment(
	state: TransformState,
	ptr: Pointer<lua.Map | lua.TemporaryIdentifier>,
	name: ts.Identifier | ts.StringLiteral | ts.NumericLiteral | ts.ComputedPropertyName,
	initializer: ts.Expression,
) {
	const left = state.capture(() => transformObjectKey(state, name));
	const right = state.capture(() => transformExpression(state, initializer));

	if (!lua.list.isEmpty(left.statements) || !lua.list.isEmpty(right.statements)) {
		disableInline(state, ptr);
	}

	state.prereqList(left.statements);
	state.prereqList(right.statements);
	assignToPointer(state, ptr, left.expression, right.expression);
}

function transformSpreadAssignment(
	state: TransformState,
	ptr: Pointer<lua.Map | lua.TemporaryIdentifier>,
	property: ts.SpreadAssignment,
) {
	disableInline(state, ptr);
	const spreadExp = transformExpression(state, property.expression);
	const keyId = lua.tempId();
	const valueId = lua.tempId();
	state.prereq(
		lua.create(lua.SyntaxKind.ForStatement, {
			ids: lua.list.make(keyId, valueId),
			expression: lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.pairs,
				args: lua.list.make(spreadExp),
			}),
			statements: lua.list.make(
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: ptr.value,
						index: keyId,
					}),
					right: valueId,
				}),
			),
		}),
	);
}

export function transformObjectLiteralExpression(state: TransformState, node: ts.ObjectLiteralExpression) {
	// starts as lua.Map, becomes lua.TemporaryIdentifier when `disableInline` is called
	const ptr: Pointer<lua.Map | lua.TemporaryIdentifier> = { value: lua.map() };
	for (const property of node.properties) {
		if (ts.isPropertyAssignment(property)) {
			if (ts.isPrivateIdentifier(property.name)) {
				state.addDiagnostic(diagnostics.noPrivateIdentifier(property.name));
				continue;
			}
			transformPropertyAssignment(state, ptr, property.name, property.initializer);
		} else if (ts.isShorthandPropertyAssignment(property)) {
			transformPropertyAssignment(state, ptr, property.name, property.name);
		} else if (ts.isSpreadAssignment(property)) {
			transformSpreadAssignment(state, ptr, property);
		} else if (ts.isMethodDeclaration(property)) {
			transformMethodDeclaration(state, property, ptr);
		} else {
			// must be ts.AccessorDeclaration, which is banned
			state.addDiagnostic(diagnostics.noGetterSetter(property));
		}
	}
	return ptr.value;
}
