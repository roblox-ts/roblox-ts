import ts from "byots";
import * as lua from "LuaAST";
import { DiagnosticFactory, diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
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
import { transformVariableStatement } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformWhileStatement } from "TSTransformer/nodes/statements/transformWhileStatement";
import { getKindName } from "TSTransformer/util/getKindName";

const NO_EMIT = () => lua.list.make<lua.Statement>();

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.Statement) => {
	state.addDiagnostic(factory(node));
	return NO_EMIT();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatementTransformer = (state: TransformState, node: any) => lua.List<lua.Statement>;

/**
 * Definitions for different types of transformations.
 */
const TRANSFORMER_BY_KIND = new Map<ts.SyntaxKind, StatementTransformer>([
	// no emit
	[ts.SyntaxKind.InterfaceDeclaration, NO_EMIT],
	[ts.SyntaxKind.TypeAliasDeclaration, NO_EMIT],
	[ts.SyntaxKind.EmptyStatement, NO_EMIT],

	// banned statements
	[ts.SyntaxKind.TryStatement, DIAGNOSTIC(diagnostics.noTryStatement)],
	[ts.SyntaxKind.ForInStatement, DIAGNOSTIC(diagnostics.noForInStatement)],
	[ts.SyntaxKind.LabeledStatement, DIAGNOSTIC(diagnostics.noLabeledStatement)],
	[ts.SyntaxKind.DebuggerStatement, DIAGNOSTIC(diagnostics.noDebuggerStatement)],

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
	[ts.SyntaxKind.VariableStatement, transformVariableStatement],
	[ts.SyntaxKind.WhileStatement, transformWhileStatement],
]);

/**
 * Transforms a singular `ts.Statement` in a `lua.list<...>`.
 * @param state The current transform state.
 * @param node The `ts.Statement` to transform.
 */
export function transformStatement(state: TransformState, node: ts.Statement): lua.List<lua.Statement> {
	// If any modifiers of the node include the `declare` keyword we do not transform
	// `declare` tells us that the identifier of the node is defined somewhere else and we should trust it
	if (node.modifiers?.some(v => v.kind === ts.SyntaxKind.DeclareKeyword)) return NO_EMIT();
	const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	if (transformer) {
		return transformer(state, node);
	}
	assert(false, `Unknown statement: ${getKindName(node)}`);
}
