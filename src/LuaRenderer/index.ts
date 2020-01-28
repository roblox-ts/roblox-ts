import * as lua from "../LuaAST";
import { renderArray } from "./nodes/expressions/array";
import { renderBinaryExpression } from "./nodes/expressions/binaryExpression";
import { renderFalseLiteral } from "./nodes/expressions/falseLiteral";
import { renderFunctionExpression } from "./nodes/expressions/functionExpression";
import { renderCallExpression } from "./nodes/expressions/indexable/callExpression";
import { renderComputedIndexExpression } from "./nodes/expressions/indexable/computedIndexExpression";
import { renderIdentifier } from "./nodes/expressions/indexable/identifier";
import { renderMethodCallExpression } from "./nodes/expressions/indexable/methodCallExpression";
import { renderParenthesizedExpression } from "./nodes/expressions/indexable/parenthesizedExpression";
import { renderPropertyAccessExpression } from "./nodes/expressions/indexable/propertyAccessExpression";
import { renderMap } from "./nodes/expressions/map";
import { renderNilLiteral } from "./nodes/expressions/nilLiteral";
import { renderNumberLiteral } from "./nodes/expressions/numberLiteral";
import { renderSet } from "./nodes/expressions/set";
import { renderStringLiteral } from "./nodes/expressions/stringLiteral";
import { renderTrueLiteral } from "./nodes/expressions/trueLiteral";
import { renderUnaryExpression } from "./nodes/expressions/unaryExpression";
import { renderVarArgsLiteral } from "./nodes/expressions/varArgsLiteral";
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

export function render(state: RenderState, node: lua.Node): string {
	// weird syntax so that it's easy to sort lines

	// indexable expressions
	if (false) return "";
	else if (lua.isIdentifier(node)) return renderIdentifier(state, node);
	else if (lua.isComputedIndexExpression(node)) return renderComputedIndexExpression(state, node);
	else if (lua.isPropertyAccessExpression(node)) return renderPropertyAccessExpression(state, node);
	else if (lua.isCallExpression(node)) return renderCallExpression(state, node);
	else if (lua.isMethodCallExpression(node)) return renderMethodCallExpression(state, node);
	else if (lua.isParenthesizedExpression(node)) return renderParenthesizedExpression(state, node);

	// expressions
	if (false) return "";
	else if (lua.isNilLiteral(node)) return renderNilLiteral(state, node);
	else if (lua.isFalseLiteral(node)) return renderFalseLiteral(state, node);
	else if (lua.isTrueLiteral(node)) return renderTrueLiteral(state, node);
	else if (lua.isNumberLiteral(node)) return renderNumberLiteral(state, node);
	else if (lua.isStringLiteral(node)) return renderStringLiteral(state, node);
	else if (lua.isVarArgsLiteral(node)) return renderVarArgsLiteral(state, node);
	else if (lua.isFunctionExpression(node)) return renderFunctionExpression(state, node);
	else if (lua.isBinaryExpression(node)) return renderBinaryExpression(state, node);
	else if (lua.isUnaryExpression(node)) return renderUnaryExpression(state, node);
	else if (lua.isArray(node)) return renderArray(state, node);
	else if (lua.isMap(node)) return renderMap(state, node);
	else if (lua.isSet(node)) return renderSet(state, node);

	// statements
	if (false) return "";
	else if (lua.isAssignment(node)) return renderAssignment(state, node);
	else if (lua.isCallStatement(node)) return renderCallStatement(state, node);
	else if (lua.isDoStatement(node)) return renderDoStatement(state, node);
	else if (lua.isWhileStatement(node)) return renderWhileStatement(state, node);
	else if (lua.isRepeatStatement(node)) return renderRepeatStatement(state, node);
	else if (lua.isIfStatement(node)) return renderIfStatement(state, node);
	else if (lua.isNumericForStatement(node)) return renderNumericForStatement(state, node);
	else if (lua.isForStatement(node)) return renderForStatement(state, node);
	else if (lua.isFunctionDeclaration(node)) return renderFunctionDeclaration(state, node);
	else if (lua.isMethodDeclaration(node)) return renderMethodDeclaration(state, node);
	else if (lua.isVariableDeclaration(node)) return renderVariableDeclaration(state, node);
	else if (lua.isReturnStatement(node)) return renderReturnStatement(state, node);
	else if (lua.isComment(node)) return renderComment(state, node);

	// fields
	if (false) return "";
	else if (lua.isMapField(node)) return renderMapField(state, node);

	throw `Unexpected node! ${lua.SyntaxKind[node.kind]}`;
}
