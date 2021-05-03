import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isMethod } from "TSTransformer/util/isMethod";
import { assignToMapPointer, Pointer } from "TSTransformer/util/pointer";
import { wrapStatementsAsGenerator } from "TSTransformer/util/wrapStatementsAsGenerator";

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
		DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(node.name));
		return luau.list.make<luau.Statement>();
	}

	// eslint-disable-next-line prefer-const
	let { statements, parameters, hasDotDotDot } = transformParameters(state, node);
	luau.list.pushList(statements, transformStatementList(state, node.body.statements));

	const name = transformObjectKey(state, node.name);

	const isAsync = !!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.Async);

	if (node.asteriskToken) {
		if (isAsync) {
			DiagnosticService.addDiagnostic(errors.noAsyncGeneratorFunctions(node));
		}
		statements = wrapStatementsAsGenerator(state, node, statements);
	}

	// can we use `function class:name() end`?
	if (!isAsync && luau.isStringLiteral(name) && !luau.isMap(ptr.value) && luau.isValidIdentifier(name.value)) {
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
					name: luau.property(ptr.value, name.value),
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
		expression = luau.call(state.TS(node, "async"), [expression]);
	}

	// we have to use `class[name] = function()`
	return state.capturePrereqs(() => assignToMapPointer(state, ptr, name, expression));
}
