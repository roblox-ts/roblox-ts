import * as lua from "LuaAST";
import { render, RenderState } from "LuaRenderer";

const BINARY_OPERATOR_MAP = {
	[lua.BinaryOperator.Plus]: "+",
	[lua.BinaryOperator.Minus]: "-",
	[lua.BinaryOperator.Asterisk]: "*",
	[lua.BinaryOperator.Slash]: "/",
	[lua.BinaryOperator.Caret]: "^",
	[lua.BinaryOperator.Percent]: "%",
	[lua.BinaryOperator.DotDot]: "..",
	[lua.BinaryOperator.LessThan]: "<",
	[lua.BinaryOperator.LessThanEqual]: "<=",
	[lua.BinaryOperator.MoreThan]: ">",
	[lua.BinaryOperator.MoreThanEqual]: ">=",
	[lua.BinaryOperator.EqualEqual]: "==",
	[lua.BinaryOperator.TildeEqual]: "~=",
	[lua.BinaryOperator.And]: "and",
	[lua.BinaryOperator.Or]: "or",
};

export function renderBinaryExpression(state: RenderState, node: lua.BinaryExpression) {
	return `${render(state, node.left)} ${BINARY_OPERATOR_MAP[node.operator]} ${render(state, node.right)}`;
}
