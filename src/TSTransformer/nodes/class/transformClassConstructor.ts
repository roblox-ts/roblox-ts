import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformClassProperty } from "TSTransformer/nodes/class/transformClassProperty";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { getStatements } from "TSTransformer/util/getStatements";
import { Pointer } from "TSTransformer/util/pointer";

export function transformClassConstructor(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
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
			name: extendsRoactComponent(state, node) ? "init" : "constructor",
			statements,
			parameters,
			hasDotDotDot,
		}),
	);
}
