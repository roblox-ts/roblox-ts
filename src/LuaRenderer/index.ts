import * as lua from "LuaAST";
import { renderArray } from "LuaRenderer/nodes/expressions/array";
import { renderBinaryExpression } from "LuaRenderer/nodes/expressions/binaryExpression";
import { renderFunctionExpression } from "LuaRenderer/nodes/expressions/functionExpression";
import { renderCallExpression } from "LuaRenderer/nodes/expressions/indexable/callExpression";
import { renderComputedIndexExpression } from "LuaRenderer/nodes/expressions/indexable/computedIndexExpression";
import { renderIdentifier } from "LuaRenderer/nodes/expressions/indexable/identifier";
import { renderMethodCallExpression } from "LuaRenderer/nodes/expressions/indexable/methodCallExpression";
import { renderParenthesizedExpression } from "LuaRenderer/nodes/expressions/indexable/parenthesizedExpression";
import { renderPropertyAccessExpression } from "LuaRenderer/nodes/expressions/indexable/propertyAccessExpression";
import {
	renderFalseLiteral,
	renderNilLiteral,
	renderNumberLiteral,
	renderStringLiteral,
	renderTrueLiteral,
	renderVarArgsLiteral,
} from "LuaRenderer/nodes/expressions/literal";
import { renderMap } from "LuaRenderer/nodes/expressions/map";
import { renderSet } from "LuaRenderer/nodes/expressions/set";
import { renderUnaryExpression } from "LuaRenderer/nodes/expressions/unaryExpression";
import { renderMapField } from "LuaRenderer/nodes/fields/mapField";
import { renderAssignment } from "LuaRenderer/nodes/statements/assignment";
import { renderCallStatement } from "LuaRenderer/nodes/statements/callStatement";
import { renderComment } from "LuaRenderer/nodes/statements/comment";
import { renderDoStatement } from "LuaRenderer/nodes/statements/doStatement";
import { renderForStatement } from "LuaRenderer/nodes/statements/forStatement";
import { renderFunctionDeclaration } from "LuaRenderer/nodes/statements/functionDeclaration";
import { renderIfStatement } from "LuaRenderer/nodes/statements/ifStatement";
import { renderMethodDeclaration } from "LuaRenderer/nodes/statements/methodDeclaration";
import { renderNumericForStatement } from "LuaRenderer/nodes/statements/numericForStatement";
import { renderRepeatStatement } from "LuaRenderer/nodes/statements/repeatStatement";
import { renderReturnStatement } from "LuaRenderer/nodes/statements/returnStatement";
import { renderVariableDeclaration } from "LuaRenderer/nodes/statements/variableDeclaration";
import { renderWhileStatement } from "LuaRenderer/nodes/statements/whileStatement";
import { RenderState } from "LuaRenderer/RenderState";
import { identity } from "Shared/util/identity";

type Renderer<T extends lua.SyntaxKind> = (state: RenderState, node: lua.NodeByKind[T]) => string;

const KIND_TO_RENDERER = identity<{ [K in lua.SyntaxKind]: Renderer<K> }>({
	// indexable expressions
	[lua.SyntaxKind.Identifier]: renderIdentifier,
	[lua.SyntaxKind.ComputedIndexExpression]: renderComputedIndexExpression,
	[lua.SyntaxKind.PropertyAccessExpression]: renderPropertyAccessExpression,
	[lua.SyntaxKind.CallExpression]: renderCallExpression,
	[lua.SyntaxKind.MethodCallExpression]: renderMethodCallExpression,
	[lua.SyntaxKind.ParenthesizedExpression]: renderParenthesizedExpression,

	// expressions
	[lua.SyntaxKind.NilLiteral]: renderNilLiteral,
	[lua.SyntaxKind.FalseLiteral]: renderFalseLiteral,
	[lua.SyntaxKind.TrueLiteral]: renderTrueLiteral,
	[lua.SyntaxKind.NumberLiteral]: renderNumberLiteral,
	[lua.SyntaxKind.StringLiteral]: renderStringLiteral,
	[lua.SyntaxKind.VarArgsLiteral]: renderVarArgsLiteral,
	[lua.SyntaxKind.FunctionExpression]: renderFunctionExpression,
	[lua.SyntaxKind.BinaryExpression]: renderBinaryExpression,
	[lua.SyntaxKind.UnaryExpression]: renderUnaryExpression,
	[lua.SyntaxKind.Array]: renderArray,
	[lua.SyntaxKind.Map]: renderMap,
	[lua.SyntaxKind.Set]: renderSet,

	// statements
	[lua.SyntaxKind.Assignment]: renderAssignment,
	[lua.SyntaxKind.CallStatement]: renderCallStatement,
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

export function render<T extends lua.SyntaxKind>(state: RenderState, node: lua.Node<T>): string {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return KIND_TO_RENDERER[node.kind](state, node as any);
}
