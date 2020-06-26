import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { getStatements } from "TSTransformer/util/getStatements";
import { Pointer } from "TSTransformer/util/pointer";

export function transformClassConstructor(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	ptr: Pointer<lua.AnyIdentifier>,
	originNode?: ts.ConstructorDeclaration & { body: ts.Block },
) {
	const statements = lua.list.make<lua.Statement>();

	let bodyStatements = originNode ? getStatements(originNode.body) : [];

	const isRoact = extendsRoactComponent(state, node);
	let removeFirstSuper = isRoact;

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
	}

	// property parameters must come after the first super() call
	function transformFirstSuper() {
		if (!removeFirstSuper) {
			removeFirstSuper = true;
			if (bodyStatements.length > 0) {
				const firstStatement = bodyStatements[0];
				if (ts.isExpressionStatement(firstStatement) && ts.isSuperCall(firstStatement.expression)) {
					lua.list.pushList(statements, transformStatementList(state, [firstStatement]));
				}
			}
		}
	}

	for (const parameter of originNode?.parameters ?? []) {
		if (ts.isParameterPropertyDeclaration(parameter, parameter.parent)) {
			transformFirstSuper();
			const paramId = transformIdentifierDefined(state, parameter.name);
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression: lua.globals.self,
						name: paramId.name,
					}),
					right: paramId,
				}),
			);
		}
	}

	for (const member of node.members) {
		if (ts.isPropertyDeclaration(member) && !ts.hasStaticModifier(member)) {
			transformFirstSuper();

			const name = member.name;
			if (ts.isPrivateIdentifier(name)) {
				state.addDiagnostic(diagnostics.noPrivateIdentifier(node));
				return lua.list.make<lua.Statement>();
			}

			const [index, indexPrereqs] = state.capture(() => transformObjectKey(state, name));
			lua.list.pushList(statements, indexPrereqs);

			const initializer = member.initializer;
			if (!initializer) {
				return lua.list.make<lua.Statement>();
			}

			const [right, rightPrereqs] = state.capture(() => transformExpression(state, initializer));
			lua.list.pushList(statements, rightPrereqs);

			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: ptr.value,
						index,
					}),
					right,
				}),
			);
		}
	}

	// if removeFirstSuper and first statement is `super()`, remove it
	if (removeFirstSuper && bodyStatements.length > 0) {
		const firstStatement = bodyStatements[0];
		if (ts.isExpressionStatement(firstStatement) && ts.isSuperCall(firstStatement.expression)) {
			bodyStatements = bodyStatements.slice(1);
		}
	}

	lua.list.pushList(statements, transformStatementList(state, bodyStatements));

	return lua.list.make<lua.Statement>(
		lua.create(lua.SyntaxKind.MethodDeclaration, {
			expression: ptr.value,
			name: isRoact ? "init" : "constructor",
			statements,
			parameters,
			hasDotDotDot,
		}),
	);
}
