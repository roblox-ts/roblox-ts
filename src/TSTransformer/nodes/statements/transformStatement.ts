import luau from "@roblox-ts/luau-ast";
import { DiagnosticFactory, errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformBlock } from "TSTransformer/nodes/statements/transformBlock";
import { transformBreakStatement } from "TSTransformer/nodes/statements/transformBreakStatement";
import { transformClassDeclaration } from "TSTransformer/nodes/statements/transformClassDeclaration";
import { transformContinueStatement } from "TSTransformer/nodes/statements/transformContinueStatement";
import { transformDoStatement } from "TSTransformer/nodes/statements/transformDoStatement";
import { transformEnumDeclaration } from "TSTransformer/nodes/statements/transformEnumDeclaration";
import { transformExportAssignment } from "TSTransformer/nodes/statements/transformExportAssignment";
import { transformExportDeclaration } from "TSTransformer/nodes/statements/transformExportDeclaration";
import { transformExpressionStatement } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformForOfStatement } from "TSTransformer/nodes/statements/transformForOfStatement";
import { transformForStatement } from "TSTransformer/nodes/statements/transformForStatement";
import { transformFunctionDeclaration } from "TSTransformer/nodes/statements/transformFunctionDeclaration";
import { transformIfStatement } from "TSTransformer/nodes/statements/transformIfStatement";
import { transformImportDeclaration } from "TSTransformer/nodes/statements/transformImportDeclaration";
import { transformImportEqualsDeclaration } from "TSTransformer/nodes/statements/transformImportEqualsDeclaration";
import { transformModuleDeclaration } from "TSTransformer/nodes/statements/transformModuleDeclaration";
import { transformReturnStatement } from "TSTransformer/nodes/statements/transformReturnStatement";
import { transformSwitchStatement } from "TSTransformer/nodes/statements/transformSwitchStatement";
import { transformThrowStatement } from "TSTransformer/nodes/statements/transformThrowStatement";
import { transformTryStatement } from "TSTransformer/nodes/statements/transformTryStatement";
import { transformVariableStatement } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformWhileStatement } from "TSTransformer/nodes/statements/transformWhileStatement";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

const NO_EMIT = () => luau.list.make<luau.Statement>();

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.Statement) => {
	DiagnosticService.addDiagnostic(factory(node));
	return NO_EMIT();
};

type Validate<T> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- typecheck only works with `any`
	[k in keyof T]: T[k] extends [infer Kind, infer C extends (...args: any) => unknown]
		? "kind" extends keyof Parameters<C>[1]
			? Kind extends Parameters<C>[1]["kind"]
				? T[k]
				: never
			: T[k]
		: never;
};

function createTransformerMap<
	T extends Array<
		[
			ts.SyntaxKind,
			{ bivariant(state: TransformState, statement: ts.Statement): luau.List<luau.Statement> }["bivariant"],
		]
	>,
>(
	values: Validate<[...T]>,
): Map<ts.SyntaxKind, (state: TransformState, statement: ts.Statement) => luau.List<luau.Statement>> {
	return new Map(values);
}

const TRANSFORMER_BY_KIND = createTransformerMap([
	// no emit
	[ts.SyntaxKind.InterfaceDeclaration, NO_EMIT],
	[ts.SyntaxKind.TypeAliasDeclaration, NO_EMIT],
	[ts.SyntaxKind.EmptyStatement, NO_EMIT],

	// banned statements
	[ts.SyntaxKind.ForInStatement, DIAGNOSTIC(errors.noForInStatement)],
	[ts.SyntaxKind.LabeledStatement, DIAGNOSTIC(errors.noLabeledStatement)],
	[ts.SyntaxKind.DebuggerStatement, DIAGNOSTIC(errors.noDebuggerStatement)],

	// regular transforms
	[ts.SyntaxKind.Block, transformBlock],
	[ts.SyntaxKind.BreakStatement, transformBreakStatement],
	[ts.SyntaxKind.ClassDeclaration, transformClassDeclaration],
	[ts.SyntaxKind.ContinueStatement, transformContinueStatement],
	[ts.SyntaxKind.DoStatement, transformDoStatement],
	[ts.SyntaxKind.EnumDeclaration, transformEnumDeclaration],
	[ts.SyntaxKind.ExportAssignment, transformExportAssignment],
	[ts.SyntaxKind.ExportDeclaration, transformExportDeclaration],
	[ts.SyntaxKind.ExpressionStatement, transformExpressionStatement],
	[ts.SyntaxKind.ForOfStatement, transformForOfStatement],
	[ts.SyntaxKind.ForStatement, transformForStatement],
	[ts.SyntaxKind.FunctionDeclaration, transformFunctionDeclaration],
	[ts.SyntaxKind.IfStatement, transformIfStatement],
	[ts.SyntaxKind.ImportDeclaration, transformImportDeclaration],
	[ts.SyntaxKind.ImportEqualsDeclaration, transformImportEqualsDeclaration],
	[ts.SyntaxKind.ModuleDeclaration, transformModuleDeclaration],
	[ts.SyntaxKind.ReturnStatement, transformReturnStatement],
	[ts.SyntaxKind.SwitchStatement, transformSwitchStatement],
	[ts.SyntaxKind.ThrowStatement, transformThrowStatement],
	[ts.SyntaxKind.TryStatement, transformTryStatement],
	[ts.SyntaxKind.VariableStatement, transformVariableStatement],
	[ts.SyntaxKind.WhileStatement, transformWhileStatement],
]);

/**
 * Transforms a singular `ts.Statement` in a `luau.list<...>`.
 * @param state The current transform state.
 * @param node The `ts.Statement` to transform.
 */
export function transformStatement(state: TransformState, node: ts.Statement): luau.List<luau.Statement> {
	// if any modifiers of the node include the `declare` keyword we do not transform
	// `declare` tells us that the identifier of the node is defined somewhere else and we should trust it
	const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
	if (modifiers?.some(v => v.kind === ts.SyntaxKind.DeclareKeyword)) return NO_EMIT();
	const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	if (transformer) {
		return transformer(state, node);
	}
	assert(false, `Unknown statement: ${getKindName(node.kind)}`);
}
