import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isMethod } from "TSTransformer/util/isMethod";
import { assignToMapPointer, Pointer } from "TSTransformer/util/pointer";

export function transformMethodDeclaration(
	state: TransformState,
	node: ts.MethodDeclaration,
	ptr: Pointer<lua.Map | lua.AnyIdentifier>,
) {
	if (!node.body) {
		return lua.list.make<lua.Statement>();
	}

	assert(node.name);
	if (ts.isPrivateIdentifier(node.name)) {
		state.addDiagnostic(diagnostics.noPrivateIdentifier(node.name));
		return lua.list.make<lua.Statement>();
	}

	const { statements, parameters, hasDotDotDot } = transformParameters(state, node);
	lua.list.pushList(statements, transformStatementList(state, node.body.statements));

	const name = transformObjectKey(state, node.name);

	const isAsync = !!(node.modifierFlagsCache & ts.ModifierFlags.Async);

	// can we use `function class:name() end`?
	if (!isAsync && lua.isStringLiteral(name) && !lua.isMap(ptr.value)) {
		if (isMethod(state, node)) {
			lua.list.shift(parameters); // remove `self`
			return lua.list.make(
				lua.create(lua.SyntaxKind.MethodDeclaration, {
					expression: ptr.value,
					name: name.value,
					statements,
					parameters,
					hasDotDotDot,
				}),
			);
		} else {
			return lua.list.make(
				lua.create(lua.SyntaxKind.FunctionDeclaration, {
					name: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression: ptr.value,
						name: name.value,
					}),
					localize: false,
					statements,
					parameters,
					hasDotDotDot,
				}),
			);
		}
	}

	let expression: lua.Expression = lua.create(lua.SyntaxKind.FunctionExpression, {
		statements,
		parameters,
		hasDotDotDot,
	});

	if (isAsync) {
		expression = lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS("async"),
			args: lua.list.make(expression),
		});
	}

	// we have to use `class[name] = function()`
	return state.capturePrereqs(() => assignToMapPointer(state, ptr, name, expression));
}
