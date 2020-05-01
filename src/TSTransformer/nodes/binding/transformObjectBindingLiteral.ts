import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";

export function transformObjectBindingLiteral(
	state: TransformState,
	bindingLiteral: ts.ObjectLiteralExpression,
	parentId: lua.AnyIdentifier,
	accessType: ts.Type | Array<ts.Type>,
) {}
