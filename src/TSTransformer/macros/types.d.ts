import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";

export type MacroList<T> = { [index: string]: T };

export type IdentifierMacro = (state: TransformState, node: ts.Identifier) => luau.Expression;
export type ConstructorMacro = (state: TransformState, node: ts.NewExpression) => luau.Expression;
export type CallMacro = (
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
) => luau.Expression;
export type PropertyCallMacro = (
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
	expression: luau.Expression,
) => luau.Expression;
