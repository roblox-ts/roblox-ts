import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { DiagnosticFactory, diagnostics } from "TSTransformer/diagnostics";
import { TransformState } from "TSTransformer/TransformState";
import { getKindName } from "TSTransformer/util/getKindName";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { Pointer } from "Shared/types";
import { transformParameters } from "TSTransformer/nodes/transformParameters";

const NO_EMIT = () => lua.list.make<lua.Statement>();

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.ClassElement) => {
	state.addDiagnostic(factory(node));
	return NO_EMIT();
};

const noPrivateIdentifier = DIAGNOSTIC(diagnostics.noPrivateIdentifier);
function transformProperty(state: TransformState, node: ts.PropertyDeclaration, ptr: Pointer<lua.AnyIdentifier>) {
	if (ts.isPrivateIdentifier(node.name)) {
		return noPrivateIdentifier(state, node);
	}
	if (!node.initializer) {
		console.log(node);
		return NO_EMIT();
	}
	return lua.list.make(
		lua.create(lua.SyntaxKind.Assignment, {
			left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
				expression: ptr.value,
				index: transformExpression(
					state,
					ts.isComputedPropertyName(node.name) ? node.name.expression : node.name,
				),
			}),
			right: transformExpression(state, node.initializer),
		}),
	);
}

function transformPropertyDeclaration(
	state: TransformState,
	node: ts.PropertyDeclaration,
	ptr: Pointer<lua.AnyIdentifier>,
) {
	if (ts.hasStaticModifier(node)) {
		return transformProperty(state, node, ptr);
	}
	return NO_EMIT();
}

function transformConstructorDeclaration(
	state: TransformState,
	node: ts.ConstructorDeclaration,
	ptr: Pointer<lua.AnyIdentifier>,
) {
	const statements = lua.list.make<lua.Statement>();
	node.parent.members
		.filter(el => ts.isPropertyDeclaration(el) && !ts.hasStaticModifier(el))
		.forEach(element => {
			lua.list.pushList(
				statements,
				transformProperty(state, element as ts.PropertyDeclaration, { value: lua.globals.self }),
			);
		});
	const { statements: paramStatements, parameters, hasDotDotDot } = transformParameters(state, node.parameters);
	lua.list.pushList(statements, paramStatements);
	return lua.list.make<lua.Statement>(
		lua.create(lua.SyntaxKind.MethodDeclaration, {
			expression: ptr.value,
			name: lua.id("constructor"),
			statements,
			parameters,
			hasDotDotDot,
		}),
	);
}

const TRANSFORMER_BY_KIND = new Map<
	ts.SyntaxKind,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(state: TransformState, node: any, ptr: Pointer<lua.AnyIdentifier>) => lua.List<lua.Statement>
>([
	// Type: no emit
	[ts.SyntaxKind.IndexSignature, NO_EMIT],
	// Does not add functionality; auto-added by LuaRenderer
	[ts.SyntaxKind.SemicolonClassElement, NO_EMIT],
	// Exclusive to ClassElement
	[ts.SyntaxKind.PropertyDeclaration, transformPropertyDeclaration],
	[ts.SyntaxKind.Constructor, transformConstructorDeclaration],
	// Shared with ObjectLiteralExpression, so uses separate file
	[ts.SyntaxKind.MethodDeclaration, transformMethodDeclaration],
	[ts.SyntaxKind.GetAccessor, DIAGNOSTIC(diagnostics.noGetterSetter)],
	[ts.SyntaxKind.SetAccessor, DIAGNOSTIC(diagnostics.noGetterSetter)],
]);

export function transformClassElement(state: TransformState, node: ts.ClassElement, ptr: Pointer<lua.AnyIdentifier>) {
	const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	if (transformer) {
		return transformer(state, node, ptr);
	}
	assert(false, `Unknown statement: ${getKindName(node)}`);
}
