import * as lua from "../LuaAST";
import { identity } from "../Shared/util/identity";
import { renderArray } from "./nodes/expressions/array";
import { renderBinaryExpression } from "./nodes/expressions/binaryExpression";
import { renderFunctionExpression } from "./nodes/expressions/functionExpression";
import { renderCallExpression } from "./nodes/expressions/indexable/callExpression";
import { renderComputedIndexExpression } from "./nodes/expressions/indexable/computedIndexExpression";
import { renderIdentifier } from "./nodes/expressions/indexable/identifier";
import { renderMethodCallExpression } from "./nodes/expressions/indexable/methodCallExpression";
import { renderParenthesizedExpression } from "./nodes/expressions/indexable/parenthesizedExpression";
import { renderPropertyAccessExpression } from "./nodes/expressions/indexable/propertyAccessExpression";
import {
	renderFalseLiteral,
	renderNilLiteral,
	renderNumberLiteral,
	renderStringLiteral,
	renderTrueLiteral,
	renderVarArgsLiteral,
} from "./nodes/expressions/literal";
import { renderMap } from "./nodes/expressions/map";
import { renderSet } from "./nodes/expressions/set";
import { renderUnaryExpression } from "./nodes/expressions/unaryExpression";
import { renderMapField } from "./nodes/fields/mapField";
import { renderAssignment } from "./nodes/statements/assignment";
import { renderCallStatement } from "./nodes/statements/callStatement";
import { renderComment } from "./nodes/statements/comment";
import { renderDoStatement } from "./nodes/statements/doStatement";
import { renderForStatement } from "./nodes/statements/forStatement";
import { renderFunctionDeclaration } from "./nodes/statements/functionDeclaration";
import { renderIfStatement } from "./nodes/statements/ifStatement";
import { renderMethodDeclaration } from "./nodes/statements/methodDeclaration";
import { renderNumericForStatement } from "./nodes/statements/numericForStatement";
import { renderRepeatStatement } from "./nodes/statements/repeatStatement";
import { renderReturnStatement } from "./nodes/statements/returnStatement";
import { renderVariableDeclaration } from "./nodes/statements/variableDeclaration";
import { renderWhileStatement } from "./nodes/statements/whileStatement";
import { RenderState } from "./RenderState";

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
