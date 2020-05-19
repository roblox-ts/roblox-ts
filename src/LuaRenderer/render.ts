import ts from "byots";
import * as lua from "LuaAST";
import { renderCallExpression } from "LuaRenderer/nodes/expressions/indexable/renderCallExpression";
import { renderComputedIndexExpression } from "LuaRenderer/nodes/expressions/indexable/renderComputedIndexExpression";
import { renderEmptyIdentifier } from "LuaRenderer/nodes/expressions/indexable/renderEmptyIdentifier";
import { renderIdentifier } from "LuaRenderer/nodes/expressions/indexable/renderIdentifier";
import { renderMethodCallExpression } from "LuaRenderer/nodes/expressions/indexable/renderMethodCallExpression";
import { renderParenthesizedExpression } from "LuaRenderer/nodes/expressions/indexable/renderParenthesizedExpression";
import { renderPropertyAccessExpression } from "LuaRenderer/nodes/expressions/indexable/renderPropertyAccessExpression";
import { renderTemporaryIdentifier } from "LuaRenderer/nodes/expressions/indexable/renderTemporaryIdentifier";
import { renderArray } from "LuaRenderer/nodes/expressions/renderArray";
import { renderBinaryExpression } from "LuaRenderer/nodes/expressions/renderBinaryExpression";
import { renderFunctionExpression } from "LuaRenderer/nodes/expressions/renderFunctionExpression";
import { renderNumberLiteral, renderStringLiteral } from "LuaRenderer/nodes/expressions/renderLiteral";
import { renderMap } from "LuaRenderer/nodes/expressions/renderMap";
import { renderSet } from "LuaRenderer/nodes/expressions/renderSet";
import { renderUnaryExpression } from "LuaRenderer/nodes/expressions/renderUnaryExpression";
import { renderMapField } from "LuaRenderer/nodes/fields/renderMapField";
import { renderAssignment } from "LuaRenderer/nodes/statements/renderAssignment";
import { renderBreakStatement } from "LuaRenderer/nodes/statements/renderBreakStatement";
import { renderCallStatement } from "LuaRenderer/nodes/statements/renderCallStatement";
import { renderComment } from "LuaRenderer/nodes/statements/renderComment";
import { renderContinueStatement } from "LuaRenderer/nodes/statements/renderContinueStatement";
import { renderDoStatement } from "LuaRenderer/nodes/statements/renderDoStatement";
import { renderForStatement } from "LuaRenderer/nodes/statements/renderForStatement";
import { renderFunctionDeclaration } from "LuaRenderer/nodes/statements/renderFunctionDeclaration";
import { renderIfStatement } from "LuaRenderer/nodes/statements/renderIfStatement";
import { renderMethodDeclaration } from "LuaRenderer/nodes/statements/renderMethodDeclaration";
import { renderNumericForStatement } from "LuaRenderer/nodes/statements/renderNumericForStatement";
import { renderRepeatStatement } from "LuaRenderer/nodes/statements/renderRepeatStatement";
import { renderReturnStatement } from "LuaRenderer/nodes/statements/renderReturnStatement";
import { renderVariableDeclaration } from "LuaRenderer/nodes/statements/renderVariableDeclaration";
import { renderWhileStatement } from "LuaRenderer/nodes/statements/renderWhileStatement";
import { RenderState } from "LuaRenderer/RenderState";
import { renderStatements } from "LuaRenderer/util/renderStatements";

type Renderer<T extends lua.SyntaxKind> = (state: RenderState, node: lua.NodeByKind[T]) => string;

const KIND_TO_RENDERER = ts.identity<{ [K in lua.SyntaxKind]: Renderer<K> }>({
	// indexable expressions
	[lua.SyntaxKind.Identifier]: renderIdentifier,
	[lua.SyntaxKind.EmptyIdentifier]: renderEmptyIdentifier,
	[lua.SyntaxKind.TemporaryIdentifier]: renderTemporaryIdentifier,
	[lua.SyntaxKind.ComputedIndexExpression]: renderComputedIndexExpression,
	[lua.SyntaxKind.PropertyAccessExpression]: renderPropertyAccessExpression,
	[lua.SyntaxKind.CallExpression]: renderCallExpression,
	[lua.SyntaxKind.MethodCallExpression]: renderMethodCallExpression,
	[lua.SyntaxKind.ParenthesizedExpression]: renderParenthesizedExpression,

	// expressions
	[lua.SyntaxKind.NilLiteral]: () => "nil",
	[lua.SyntaxKind.FalseLiteral]: () => "false",
	[lua.SyntaxKind.TrueLiteral]: () => "true",
	[lua.SyntaxKind.NumberLiteral]: renderNumberLiteral,
	[lua.SyntaxKind.StringLiteral]: renderStringLiteral,
	[lua.SyntaxKind.VarArgsLiteral]: () => "...",
	[lua.SyntaxKind.FunctionExpression]: renderFunctionExpression,
	[lua.SyntaxKind.BinaryExpression]: renderBinaryExpression,
	[lua.SyntaxKind.UnaryExpression]: renderUnaryExpression,
	[lua.SyntaxKind.Array]: renderArray,
	[lua.SyntaxKind.Map]: renderMap,
	[lua.SyntaxKind.Set]: renderSet,

	// statements
	[lua.SyntaxKind.Assignment]: renderAssignment,
	[lua.SyntaxKind.BreakStatement]: renderBreakStatement,
	[lua.SyntaxKind.CallStatement]: renderCallStatement,
	[lua.SyntaxKind.ContinueStatement]: renderContinueStatement,
	[lua.SyntaxKind.DoStatement]: renderDoStatement,
	[lua.SyntaxKind.WhileStatement]: renderWhileStatement,
	[lua.SyntaxKind.RepeatStatement]: renderRepeatStatement,
	[lua.SyntaxKind.IfStatement]: renderIfStatement,
	[lua.SyntaxKind.NumericForStatement]: renderNumericForStatement,
	[lua.SyntaxKind.ForStatement]: renderForStatement,
	[lua.SyntaxKind.FunctionDeclaration]: renderFunctionDeclaration,
	[lua.SyntaxKind.MethodDeclaration]: renderMethodDeclaration,
	[lua.SyntaxKind.VariableDeclaration]: renderVariableDeclaration,
	[lua.SyntaxKind.ReturnStatement]: renderReturnStatement,
	[lua.SyntaxKind.Comment]: renderComment,

	// fields
	[lua.SyntaxKind.MapField]: renderMapField,
});

/**
 * Returns a string that represents the given syntax node, `node`, as lua code.
 * Recursively called until the node is completely rendered.
 * @param state The state of the current rendering process.
 * @param node The node to render as lua code.
 */
export function render<T extends lua.SyntaxKind>(state: RenderState, node: lua.Node<T>): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return KIND_TO_RENDERER[node.kind](state, node as any);
}

/**
 * Returns a string that represents the given syntax tree, `ast`, as lua code.
 */
export function renderAST(ast: lua.List<lua.Statement>): string {
	return renderStatements(new RenderState(), ast);
}
