import ts from "byots";
import * as lua from "LuaAST";
import { DiagnosticFactory, diagnostics } from "Shared/diagnostics";
import { Pointer } from "Shared/types";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformClassConstructor } from "TSTransformer/nodes/class/transformClassConstructor";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformMethodDeclaration } from "TSTransformer/nodes/transformMethodDeclaration";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { getKindName } from "TSTransformer/util/getKindName";

function transformProperty(state: TransformState, node: ts.PropertyDeclaration, ptr: Pointer<lua.AnyIdentifier>) {
	if (ts.isPrivateIdentifier(node.name)) {
		state.addDiagnostic(diagnostics.noPrivateIdentifier(node));
		return lua.list.make<lua.Statement>();
	}
	if (!node.initializer) {
		return lua.list.make<lua.Statement>();
	}

	return lua.list.make(
		lua.create(lua.SyntaxKind.Assignment, {
			left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
				expression: ptr.value,
				index: transformObjectKey(state, node.name),
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
	return lua.list.make<lua.Statement>();
}

function transformConstructorDeclaration(
	state: TransformState,
	node: ts.ConstructorDeclaration,
	ptr: Pointer<lua.AnyIdentifier>,
) {
	if (node.body) {
		return transformClassConstructor(state, node.parent, node.parent.members, ptr, node);
	} else {
		return lua.list.make<lua.Statement>();
	}
}

const NO_EMIT = () => lua.list.make<lua.Statement>();

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.ClassElement) => {
	state.addDiagnostic(factory(node));
	return NO_EMIT();
};

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
