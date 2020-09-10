import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";
import { TransformState } from "TSTransformer";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isMethod } from "TSTransformer/util/isMethod";
import { assignToMapPointer, Pointer } from "TSTransformer/util/pointer";

export function transformMethodDeclaration(
	state: TransformState,
	node: ts.MethodDeclaration,
	ptr: Pointer<luau.Map | luau.AnyIdentifier>,
) {
	if (!node.body) {
		return luau.list.make<luau.Statement>();
	}

	assert(node.name);
	if (ts.isPrivateIdentifier(node.name)) {
		state.addDiagnostic(diagnostics.noPrivateIdentifier(node.name));
		return luau.list.make<luau.Statement>();
	}

	const { statements, parameters, hasDotDotDot } = transformParameters(state, node);
	luau.list.pushList(statements, transformStatementList(state, node.body.statements));

	const name = transformObjectKey(state, node.name);

	const isAsync = !!(node.modifierFlagsCache & ts.ModifierFlags.Async);

	// can we use `function class:name() end`?
	if (!isAsync && luau.isStringLiteral(name) && !luau.isMap(ptr.value) && isValidLuauIdentifier(name.value)) {
		if (isMethod(state, node)) {
			luau.list.shift(parameters); // remove `self`
			return luau.list.make(
				luau.create(luau.SyntaxKind.MethodDeclaration, {
					expression: ptr.value,
					name: name.value,
					statements,
					parameters,
					hasDotDotDot,
				}),
			);
		} else {
			return luau.list.make(
				luau.create(luau.SyntaxKind.FunctionDeclaration, {
					name: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
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

	let expression: luau.Expression = luau.create(luau.SyntaxKind.FunctionExpression, {
		statements,
		parameters,
		hasDotDotDot,
	});

	if (isAsync) {
		expression = luau.create(luau.SyntaxKind.CallExpression, {
			expression: state.TS("async"),
			args: luau.list.make(expression),
		});
	}

	// we have to use `class[name] = function()`
	return state.capturePrereqs(() => assignToMapPointer(state, ptr, name, expression));
}
