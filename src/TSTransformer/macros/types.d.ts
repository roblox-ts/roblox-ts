import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export type Macro<T extends ts.Node, U extends lua.Node> = (state: TransformState, node: T) => U;
export type MacroList<T> = { [index: string]: T };

export type IdentifierMacro = Macro<ts.Identifier, lua.Expression>;
export type CallMacro = Macro<ts.CallExpression, lua.Expression>;
export type ConstructorMacro = Macro<ts.NewExpression, lua.Expression>;
export type PropertyCallMacro = Macro<ts.CallExpression & { expression: ts.PropertyAccessExpression }, lua.Expression>;
