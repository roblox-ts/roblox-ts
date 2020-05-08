import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

declare function transformClassElement(state: TransformState, node: ts.ClassElement): lua.Statement;

export function transformClassElements(state: TransformState, nodes: ReadonlyArray<ts.ClassElement>) {
	const elements = lua.list.make<lua.Statement>();
	for (const member of nodes) {
		lua.list.push(elements, transformClassElement(state, member));
	}
	return elements;
}
