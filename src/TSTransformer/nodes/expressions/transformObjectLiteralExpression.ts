import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifier } from "TSTransformer/nodes/expressions/transformIdentifier";
import { TransformState } from "TSTransformer/TransformState";
import { pushToVar } from "TSTransformer/util/pushToVar";
import { assert } from "Shared/util/assert";

interface ObjectLiteralContext {
	exp: lua.Map | lua.TemporaryIdentifier;
}

function disableInline(
	state: TransformState,
	ctx: ObjectLiteralContext,
): asserts ctx is { exp: lua.TemporaryIdentifier } {
	if (lua.isMap(ctx.exp)) {
		ctx.exp = pushToVar(state, ctx.exp);
	}
}

function assign(
	state: TransformState,
	ctx: ObjectLiteralContext,
	left: lua.Expression,
	leftStatements: lua.List<lua.Statement>,
	right: lua.Expression,
	rightStatements: lua.List<lua.Statement>,
) {
	if (!lua.list.isEmpty(leftStatements) || !lua.list.isEmpty(rightStatements)) {
		disableInline(state, ctx);
	}
	if (lua.isMap(ctx.exp)) {
		lua.list.push(
			ctx.exp.fields,
			lua.create(lua.SyntaxKind.MapField, {
				index: left,
				value: right,
			}),
		);
	} else {
		state.prereqList(leftStatements);
		state.prereqList(rightStatements);
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: ctx.exp,
					index: left,
				}),
				right: right,
			}),
		);
	}
}

function transformPropertyAssignment(
	state: TransformState,
	ctx: ObjectLiteralContext,
	property: ts.PropertyAssignment,
) {
	if (ts.isPrivateIdentifier(property.name)) {
		state.addDiagnostic(diagnostics.noPrivateIdentifier(property.name));
		return;
	}
	let leftExp: lua.Expression;
	let leftStatements: lua.List<lua.Statement>;
	if (ts.isIdentifier(property.name)) {
		leftExp = lua.string(property.name.text);
		leftStatements = lua.list.make();
	} else {
		const name = ts.isComputedPropertyName(property.name) ? property.name.expression : property.name;
		({ expression: leftExp, statements: leftStatements } = state.capturePrereqs(() =>
			transformExpression(state, name),
		));
	}
	const rightCapture = state.capturePrereqs(() => transformExpression(state, property.initializer));
	assign(state, ctx, leftExp, leftStatements, rightCapture.expression, rightCapture.statements);
}

function transformShorthandPropertyAssignment(
	state: TransformState,
	ctx: ObjectLiteralContext,
	property: ts.ShorthandPropertyAssignment,
) {
	const rightCapture = state.capturePrereqs(() => transformIdentifier(state, property.name));
	assign(
		state,
		ctx,
		lua.string(property.name.text),
		lua.list.make(),
		rightCapture.expression,
		rightCapture.statements,
	);
}

function transformSpreadAssignment(state: TransformState, ctx: ObjectLiteralContext, property: ts.SpreadAssignment) {
	disableInline(state, ctx);
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
						expression: ctx.exp,
						index: keyId,
					}),
					right: valueId,
				}),
			),
		}),
	);
}

export function transformObjectLiteralExpression(state: TransformState, node: ts.ObjectLiteralExpression) {
	const ctx: ObjectLiteralContext = { exp: lua.map() };
	for (const property of node.properties) {
		if (ts.isPropertyAssignment(property)) {
			transformPropertyAssignment(state, ctx, property);
		} else if (ts.isShorthandPropertyAssignment(property)) {
			transformShorthandPropertyAssignment(state, ctx, property);
		} else if (ts.isSpreadAssignment(property)) {
			transformSpreadAssignment(state, ctx, property);
		} else if (ts.isMethodDeclaration(property)) {
			assert(false, "Not implemented");
		} else {
			state.addDiagnostic(diagnostics.noGetterSetter(property));
		}
	}
	return ctx.exp;
}
