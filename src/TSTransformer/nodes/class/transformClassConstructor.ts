import ts from "byots";
import * as lua from "LuaAST";
import { Pointer } from "Shared/types";
import { assert } from "Shared/util/assert";
import { transformClassProperty } from "TSTransformer/nodes/class/transformClassProperty";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { TransformState } from "TSTransformer/TransformState";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getStatements } from "TSTransformer/util/getStatements";

export function transformClassConstructor(
	state: TransformState,
	nodes: ts.NodeArray<ts.ClassElement>,
	ptr: Pointer<lua.AnyIdentifier>,
	originNode?: ts.ConstructorDeclaration,
) {
	const statements = lua.list.make<lua.Statement>();
	nodes
		.filter((el): el is ts.PropertyDeclaration => ts.isPropertyDeclaration(el) && !ts.hasStaticModifier(el))
		.forEach(el => lua.list.pushList(statements, transformClassProperty(state, el, { value: lua.globals.self })));

	let parameters = lua.list.make<lua.AnyIdentifier>();
	let hasDotDotDot = false;
	if (originNode) {
		const {
			statements: paramStatements,
			parameters: constructorParams,
			hasDotDotDot: constructorHasDotDotDot,
		} = transformParameters(state, originNode);
		lua.list.pushList(statements, paramStatements);
		parameters = constructorParams;
		hasDotDotDot = constructorHasDotDotDot;
		assert(originNode.body);
		lua.list.pushList(statements, transformStatementList(state, getStatements(originNode.body)));
	}

	return lua.list.make<lua.Statement>(
		lua.create(lua.SyntaxKind.MethodDeclaration, {
			expression: ptr.value,
			name: "constructor",
			statements,
			parameters,
			hasDotDotDot,
		}),
	);
}
