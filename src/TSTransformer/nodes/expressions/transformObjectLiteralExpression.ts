import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { assignToMapPointer, disableMapInline, MapPointer } from "TSTransformer/util/pointer";
import { isPossiblyUndefined } from "TSTransformer/util/types";

function transformPropertyAssignment(
	state: TransformState,
	ptr: MapPointer,
	name: ts.Identifier | ts.StringLiteral | ts.NumericLiteral | ts.ComputedPropertyName,
	initializer: ts.Expression,
) {
	// eslint-disable-next-line prefer-const
	let [left, leftPrereqs] = state.capture(() => transformObjectKey(state, name));
	const [right, rightPrereqs] = state.capture(() => transformExpression(state, initializer));

	if (!luau.list.isEmpty(leftPrereqs) || !luau.list.isEmpty(rightPrereqs)) {
		disableMapInline(state, ptr);
		state.prereqList(leftPrereqs);
		left = state.pushToVar(left);
	}

	state.prereqList(rightPrereqs);

	assignToMapPointer(state, ptr, left, right);
}

function transformSpreadAssignment(state: TransformState, ptr: MapPointer, property: ts.SpreadAssignment) {
	disableMapInline(state, ptr);
	let spreadExp = transformExpression(state, property.expression);

	const possiblyUndefined = isPossiblyUndefined(state.getType(property.expression));
	if (possiblyUndefined) {
		spreadExp = state.pushToVarIfComplex(spreadExp);
	}

	const keyId = luau.tempId();
	const valueId = luau.tempId();
	let statement: luau.Statement = luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(spreadExp),
		}),
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

	if (possiblyUndefined) {
		statement = luau.create(luau.SyntaxKind.IfStatement, {
			condition: spreadExp,
			statements: luau.list.make(statement),
			elseBody: luau.list.make(),
		});
	}

	state.prereq(statement);
}

export function transformObjectLiteralExpression(state: TransformState, node: ts.ObjectLiteralExpression) {
	// starts as luau.Map, becomes luau.TemporaryIdentifier when `disableInline` is called
	const ptr: MapPointer = { value: luau.map() };
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
			state.prereqList(transformMethodDeclaration(state, property, ptr));
		} else {
			// must be ts.AccessorDeclaration, which is banned
			state.addDiagnostic(diagnostics.noGetterSetter(property));
		}
	}
	return ptr.value;
}
