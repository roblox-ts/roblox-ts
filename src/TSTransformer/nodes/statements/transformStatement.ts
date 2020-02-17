import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { DiagnosticFactory, diagnostics } from "TSTransformer/diagnostics";
import { transformBlock } from "TSTransformer/nodes/statements/transformBlock";
import { transformExpressionStatement } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformFunctionDeclaration } from "TSTransformer/nodes/statements/transformFunctionDeclaration";
import { transformIfStatement } from "TSTransformer/nodes/statements/transformIfStatement";
import { transformReturnStatement } from "TSTransformer/nodes/statements/transformReturnStatement";
import { transformVariableStatement } from "TSTransformer/nodes/statements/transformVariableStatement";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

const NO_EMIT = () => lua.list.make<lua.Statement>();

const DIAGNOSTIC = (factory: DiagnosticFactory) => (state: TransformState, node: ts.Statement) => {
	state.diagnostics.push(factory(node));
	return NO_EMIT();
};

const STATEMENT_TRANSFORMERS = {
	// no emit
	[ts.SyntaxKind.InterfaceDeclaration]: NO_EMIT,
	[ts.SyntaxKind.TypeAliasDeclaration]: NO_EMIT,

	// banned statements
	[ts.SyntaxKind.TryStatement]: DIAGNOSTIC(diagnostics.noTryStatement),
	[ts.SyntaxKind.ForInStatement]: DIAGNOSTIC(diagnostics.noForInStatement),
	[ts.SyntaxKind.LabeledStatement]: DIAGNOSTIC(diagnostics.noLabeledStatement),
	[ts.SyntaxKind.DebuggerStatement]: DIAGNOSTIC(diagnostics.noDebuggerStatement),

	// regular transforms
	[ts.SyntaxKind.Block]: transformBlock,
	[ts.SyntaxKind.ExpressionStatement]: transformExpressionStatement,
	[ts.SyntaxKind.FunctionDeclaration]: transformFunctionDeclaration,
	[ts.SyntaxKind.IfStatement]: transformIfStatement,
	[ts.SyntaxKind.ReturnStatement]: transformReturnStatement,
	[ts.SyntaxKind.VariableStatement]: transformVariableStatement,
};

export function transformStatement(state: TransformState, node: ts.Statement): lua.List<lua.Statement> {
	if (node.modifiers?.some(v => v.kind === ts.SyntaxKind.DeclareKeyword)) return NO_EMIT();

	const transformer = STATEMENT_TRANSFORMERS[node.kind as keyof typeof STATEMENT_TRANSFORMERS] as
		| ((state: TransformState, node: ts.Statement) => lua.List<lua.Statement>)
		| undefined;
	if (transformer) {
		return transformer(state, node);
	}

	throw new Error(`Unknown statement: ${getKindName(node)}`);
}
