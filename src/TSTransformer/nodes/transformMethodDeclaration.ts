import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { diagnostics } from "TSTransformer/diagnostics";
import { Pointer } from "Shared/types";
import { assignToPointer } from "TSTransformer/util/assignToPointer";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";

export function transformMethodDeclaration(
	state: TransformState,
	node: ts.MethodDeclaration,
	ptr: Pointer<lua.Map | lua.AnyIdentifier>,
) {
	assert(node.name);
	if (ts.isPrivateIdentifier(node.name)) {
		state.addDiagnostic(diagnostics.noPrivateIdentifier(node.name));
		return lua.list.make<lua.Statement>();
	}

	let statements: lua.List<lua.Statement>, parameters: lua.List<lua.AnyIdentifier>, hasDotDotDot: boolean;
	if (node.body) {
		({ statements, parameters, hasDotDotDot } = transformParameters(state, node.parameters));
		lua.list.pushList(statements, transformStatementList(state, node.body.statements));
	} else {
		statements = lua.list.make<lua.Statement>();
		parameters = lua.list.make<lua.AnyIdentifier>();
		hasDotDotDot = false;
	}
	const name = transformObjectKey(state, node.name);
	// Can we use `class:name()`?
	if (lua.isAnyIdentifier(name) && !lua.isMap(ptr.value)) {
		return lua.list.make(
			lua.create(lua.SyntaxKind.MethodDeclaration, {
				expression: ptr.value,
				name,
				statements,
				parameters,
				hasDotDotDot,
			}),
		);
	}

	// We have to use `class[name] = function()`, so we need to insert `self` into parameters
	lua.list.unshift(parameters, lua.globals.self);
	return state.statement(() =>
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
