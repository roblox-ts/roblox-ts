import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import * as TSTransformer from "TSTransformer/bundle";
import ts from "typescript";

export type MacroList<T> = { [index: string]: T };

export type IdentifierMacro = (state: TransformState, node: ts.Identifier) => luau.Expression;

export type ConstructorMacro = (state: TransformState, node: ts.NewExpression) => luau.Expression;

export type CallMacro = (
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression;

export type PropertyCallMacro = (
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression | ts.ElementAccessExpression },
	expression: luau.Expression,
	args: Array<luau.Expression>,
) => luau.Expression;

export type MacroTransformer = (dependencies: {
	luau: typeof luau;
	ts: typeof ts;
	TSTransformer: typeof TSTransformer;
}) => {
	identifier?: MacroList<IdentifierMacro>;
	construct?: MacroList<ConstructorMacro>;
	call?: MacroList<CallMacro>;
	property?: Record<string, MacroList<PropertyCallMacro>>;
};
