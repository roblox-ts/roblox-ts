import * as lua from "LuaAST";
import { render } from "LuaRenderer";
import { RenderState } from "LuaRenderer";

export function renderBinaryExpression(state: RenderState, node: lua.BinaryExpression) {
	const leftStr = render(state, node.left);
	const rightStr = render(state, node.right);
	if (node.operator === lua.BinaryOperator.Plus) {
		return `${leftStr} + ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.Minus) {
		return `${leftStr} - ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.Asterisk) {
		return `${leftStr} * ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.Slash) {
		return `${leftStr} / ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.Caret) {
		return `${leftStr} ^ ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.Percent) {
		return `${leftStr} % ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.DotDot) {
		return `${leftStr} .. ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.LessThan) {
		return `${leftStr} < ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.LessThanEqual) {
		return `${leftStr} <= ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.MoreThan) {
		return `${leftStr} > ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.MoreThanEqual) {
		return `${leftStr} >= ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.EqualEqual) {
		return `${leftStr} == ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.TildeEqual) {
		return `${leftStr} ~= ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.And) {
		return `${leftStr} and ${rightStr}`;
	} else if (node.operator === lua.BinaryOperator.Or) {
		return `${leftStr} or ${rightStr}`;
	} else {
		throw `Unexpected operator! ${lua.BinaryOperator[node.operator]} `;
	}
}
