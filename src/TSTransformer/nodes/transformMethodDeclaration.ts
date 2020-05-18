import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { Pointer } from "Shared/types";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { assignToPointer } from "TSTransformer/util/assignToPointer";
import { isMethod } from "TSTransformer/util/isMethod";

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

	// Can we use `class:name()`?
	if (lua.isStringLiteral(name) && !lua.isMap(ptr.value) && isMethod(state, node)) {
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
	}

	// We have to use `class[name] = function()`
	return state.capturePrereqs(() =>
		assignToPointer(
			state,
			ptr,
			name,
			lua.create(lua.SyntaxKind.FunctionExpression, {
				statements,
				parameters,
				hasDotDotDot,
			}),
		),
	);
}
