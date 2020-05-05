import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticFactory, diagnostics } from "TSTransformer/diagnostics";
import { transformBlock } from "TSTransformer/nodes/statements/transformBlock";
import { transformBreakStatement } from "TSTransformer/nodes/statements/transformBreakStatement";
import { transformContinueStatement } from "TSTransformer/nodes/statements/transformContinueStatement";
import { transformDoStatement } from "TSTransformer/nodes/statements/transformDoStatement";
import { transformEnumDeclaration } from "TSTransformer/nodes/statements/transformEnumDeclaration";
import { transformExpressionStatement } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformFunctionDeclaration } from "TSTransformer/nodes/statements/transformFunctionDeclaration";
import { transformIfStatement } from "TSTransformer/nodes/statements/transformIfStatement";
import { transformReturnStatement } from "TSTransformer/nodes/statements/transformReturnStatement";
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

const TRANSFORMER_BY_KIND = new Map<ts.SyntaxKind, StatementTransformer>([
	// no emit
	[ts.SyntaxKind.InterfaceDeclaration, NO_EMIT],
	[ts.SyntaxKind.TypeAliasDeclaration, NO_EMIT],
	[ts.SyntaxKind.ExportDeclaration, NO_EMIT], // TODO remove this when we support ExportDeclaration

	// banned statements
	[ts.SyntaxKind.TryStatement, DIAGNOSTIC(diagnostics.noTryStatement)],
	[ts.SyntaxKind.ForInStatement, DIAGNOSTIC(diagnostics.noForInStatement)],
	[ts.SyntaxKind.LabeledStatement, DIAGNOSTIC(diagnostics.noLabeledStatement)],
	[ts.SyntaxKind.DebuggerStatement, DIAGNOSTIC(diagnostics.noDebuggerStatement)],

	// regular transforms
	[ts.SyntaxKind.Block, transformBlock],
	[ts.SyntaxKind.BreakStatement, transformBreakStatement],
	[ts.SyntaxKind.ContinueStatement, transformContinueStatement],
	[ts.SyntaxKind.DoStatement, transformDoStatement],
	[ts.SyntaxKind.EnumDeclaration, transformEnumDeclaration],
	[ts.SyntaxKind.ExpressionStatement, transformExpressionStatement],
	[ts.SyntaxKind.FunctionDeclaration, transformFunctionDeclaration],
	[ts.SyntaxKind.IfStatement, transformIfStatement],
	[ts.SyntaxKind.ReturnStatement, transformReturnStatement],
	[ts.SyntaxKind.ThrowStatement, transformThrowStatement],
	[ts.SyntaxKind.VariableStatement, transformVariableStatement],
	[ts.SyntaxKind.WhileStatement, transformWhileStatement],
]);

export function transformStatement(state: TransformState, node: ts.Statement): lua.List<lua.Statement> {
	if (node.modifiers?.some(v => v.kind === ts.SyntaxKind.DeclareKeyword)) return NO_EMIT();
	const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	if (transformer) {
		return transformer(state, node);
	}
	assert(false, `Unknown statement: ${getKindName(node)}`);
}
