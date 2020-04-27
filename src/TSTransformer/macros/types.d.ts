import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export type MacroList<T> = { [index: string]: T };

export type IdentifierMacro = (state: TransformState, node: ts.Identifier) => lua.Expression;
export type ConstructorMacro = (state: TransformState, node: ts.NewExpression) => lua.Expression;
export type CallMacro = (
	state: TransformState,
	node: ts.CallExpression,
	expression: lua.IndexableExpression,
) => lua.Expression;
export type PropertyCallMacro = (
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
	expression: lua.IndexableExpression,
) => lua.Expression;
