import ts from "byots";
import luau from "LuauAST";
import { renderCallExpression } from "LuauRenderer/nodes/expressions/indexable/renderCallExpression";
import { renderComputedIndexExpression } from "LuauRenderer/nodes/expressions/indexable/renderComputedIndexExpression";
import { renderEmptyIdentifier } from "LuauRenderer/nodes/expressions/indexable/renderEmptyIdentifier";
import { renderIdentifier } from "LuauRenderer/nodes/expressions/indexable/renderIdentifier";
import { renderMethodCallExpression } from "LuauRenderer/nodes/expressions/indexable/renderMethodCallExpression";
import { renderParenthesizedExpression } from "LuauRenderer/nodes/expressions/indexable/renderParenthesizedExpression";
import { renderPropertyAccessExpression } from "LuauRenderer/nodes/expressions/indexable/renderPropertyAccessExpression";
import { renderTemporaryIdentifier } from "LuauRenderer/nodes/expressions/indexable/renderTemporaryIdentifier";
import { renderArray } from "LuauRenderer/nodes/expressions/renderArray";
import { renderBinaryExpression } from "LuauRenderer/nodes/expressions/renderBinaryExpression";
import { renderFunctionExpression } from "LuauRenderer/nodes/expressions/renderFunctionExpression";
import { renderNumberLiteral, renderStringLiteral } from "LuauRenderer/nodes/expressions/renderLiteral";
import { renderMap } from "LuauRenderer/nodes/expressions/renderMap";
import { renderMixedTable } from "LuauRenderer/nodes/expressions/renderMixedTable";
import { renderSet } from "LuauRenderer/nodes/expressions/renderSet";
import { renderUnaryExpression } from "LuauRenderer/nodes/expressions/renderUnaryExpression";
import { renderMapField } from "LuauRenderer/nodes/fields/renderMapField";
import { renderAssignment } from "LuauRenderer/nodes/statements/renderAssignment";
import { renderBreakStatement } from "LuauRenderer/nodes/statements/renderBreakStatement";
import { renderCallStatement } from "LuauRenderer/nodes/statements/renderCallStatement";
import { renderComment } from "LuauRenderer/nodes/statements/renderComment";
import { renderContinueStatement } from "LuauRenderer/nodes/statements/renderContinueStatement";
import { renderDoStatement } from "LuauRenderer/nodes/statements/renderDoStatement";
import { renderForStatement } from "LuauRenderer/nodes/statements/renderForStatement";
import { renderFunctionDeclaration } from "LuauRenderer/nodes/statements/renderFunctionDeclaration";
import { renderIfStatement } from "LuauRenderer/nodes/statements/renderIfStatement";
import { renderMethodDeclaration } from "LuauRenderer/nodes/statements/renderMethodDeclaration";
import { renderNumericForStatement } from "LuauRenderer/nodes/statements/renderNumericForStatement";
import { renderRepeatStatement } from "LuauRenderer/nodes/statements/renderRepeatStatement";
import { renderReturnStatement } from "LuauRenderer/nodes/statements/renderReturnStatement";
import { renderVariableDeclaration } from "LuauRenderer/nodes/statements/renderVariableDeclaration";
import { renderWhileStatement } from "LuauRenderer/nodes/statements/renderWhileStatement";
import { RenderState } from "LuauRenderer/RenderState";
import { renderStatements } from "LuauRenderer/util/renderStatements";

type Renderer<T extends luau.SyntaxKind> = (state: RenderState, node: luau.NodeByKind[T]) => string;

const KIND_TO_RENDERER = ts.identity<{ [K in luau.SyntaxKind]: Renderer<K> }>({
	// indexable expressions
	[luau.SyntaxKind.Identifier]: renderIdentifier,
	[luau.SyntaxKind.EmptyIdentifier]: renderEmptyIdentifier,
	[luau.SyntaxKind.TemporaryIdentifier]: renderTemporaryIdentifier,
	[luau.SyntaxKind.ComputedIndexExpression]: renderComputedIndexExpression,
	[luau.SyntaxKind.PropertyAccessExpression]: renderPropertyAccessExpression,
	[luau.SyntaxKind.CallExpression]: renderCallExpression,
	[luau.SyntaxKind.MethodCallExpression]: renderMethodCallExpression,
	[luau.SyntaxKind.ParenthesizedExpression]: renderParenthesizedExpression,

	// expressions
	[luau.SyntaxKind.NilLiteral]: () => "nil",
	[luau.SyntaxKind.FalseLiteral]: () => "false",
	[luau.SyntaxKind.TrueLiteral]: () => "true",
	[luau.SyntaxKind.NumberLiteral]: renderNumberLiteral,
	[luau.SyntaxKind.StringLiteral]: renderStringLiteral,
	[luau.SyntaxKind.VarArgsLiteral]: () => "...",
	[luau.SyntaxKind.FunctionExpression]: renderFunctionExpression,
	[luau.SyntaxKind.BinaryExpression]: renderBinaryExpression,
	[luau.SyntaxKind.UnaryExpression]: renderUnaryExpression,
	[luau.SyntaxKind.Array]: renderArray,
	[luau.SyntaxKind.Map]: renderMap,
	[luau.SyntaxKind.Set]: renderSet,
	[luau.SyntaxKind.MixedTable]: renderMixedTable,

	// statements
	[luau.SyntaxKind.Assignment]: renderAssignment,
	[luau.SyntaxKind.BreakStatement]: renderBreakStatement,
	[luau.SyntaxKind.CallStatement]: renderCallStatement,
	[luau.SyntaxKind.ContinueStatement]: renderContinueStatement,
	[luau.SyntaxKind.DoStatement]: renderDoStatement,
	[luau.SyntaxKind.WhileStatement]: renderWhileStatement,
	[luau.SyntaxKind.RepeatStatement]: renderRepeatStatement,
	[luau.SyntaxKind.IfStatement]: renderIfStatement,
	[luau.SyntaxKind.NumericForStatement]: renderNumericForStatement,
	[luau.SyntaxKind.ForStatement]: renderForStatement,
	[luau.SyntaxKind.FunctionDeclaration]: renderFunctionDeclaration,
	[luau.SyntaxKind.MethodDeclaration]: renderMethodDeclaration,
	[luau.SyntaxKind.VariableDeclaration]: renderVariableDeclaration,
	[luau.SyntaxKind.ReturnStatement]: renderReturnStatement,
	[luau.SyntaxKind.Comment]: renderComment,

	// fields
	[luau.SyntaxKind.MapField]: renderMapField,
});

/**
 * Returns a string that represents the given syntax node, `node`, as Luau code.
 * Recursively called until the node is completely rendered.
 * @param state The state of the current rendering process.
 * @param node The node to render as Luau code.
 */
export function render<T extends luau.SyntaxKind>(state: RenderState, node: luau.Node<T>): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return KIND_TO_RENDERER[node.kind](state, node as any);
}

/**
 * Returns a string that represents the given syntax tree, `ast`, as Luau code.
 */
export function renderAST(ast: luau.List<luau.Statement>): string {
	return renderStatements(new RenderState(), ast);
}
