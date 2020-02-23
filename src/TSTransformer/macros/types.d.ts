import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export type Macro<T extends ts.Node, U extends lua.Node> = (state: TransformState, node: T) => U;
