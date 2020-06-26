import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { assignToMapPointer, disableMapInline, MapPointer } from "TSTransformer/util/pointer";
import { canBeUndefined } from "TSTransformer/util/types";

function transformPropertyAssignment(
	state: TransformState,
	ptr: MapPointer,
	name: ts.Identifier | ts.StringLiteral | ts.NumericLiteral | ts.ComputedPropertyName,
	initializer: ts.Expression,
) {
	const [left, leftPrereqs] = state.capture(() => transformObjectKey(state, name));
	const [right, rightPrereqs] = state.capture(() => transformExpression(state, initializer));

	if (!lua.list.isEmpty(leftPrereqs) || !lua.list.isEmpty(rightPrereqs)) {
		disableMapInline(state, ptr);
	}

	state.prereqList(leftPrereqs);
	state.prereqList(rightPrereqs);
	assignToMapPointer(state, ptr, left, right);
}

function transformSpreadAssignment(state: TransformState, ptr: MapPointer, property: ts.SpreadAssignment) {
	disableMapInline(state, ptr);
	let spreadExp = transformExpression(state, property.expression);

	const possiblyUndefined = canBeUndefined(state, state.getType(property.expression));
	if (possiblyUndefined) {
		spreadExp = state.pushToVarIfComplex(spreadExp);
	}

	const keyId = lua.tempId();
	const valueId = lua.tempId();
	let statement: lua.Statement = lua.create(lua.SyntaxKind.ForStatement, {
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
	});

	if (possiblyUndefined) {
		statement = lua.create(lua.SyntaxKind.IfStatement, {
			condition: spreadExp,
			statements: lua.list.make(statement),
			elseBody: lua.list.make(),
		});
	}

	state.prereq(statement);
}

export function transformObjectLiteralExpression(state: TransformState, node: ts.ObjectLiteralExpression) {
	// starts as lua.Map, becomes lua.TemporaryIdentifier when `disableInline` is called
	const ptr: MapPointer = { value: lua.map() };
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
