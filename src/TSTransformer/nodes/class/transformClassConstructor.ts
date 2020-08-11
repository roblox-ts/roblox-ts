import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getStatements } from "TSTransformer/util/getStatements";
import { Pointer } from "TSTransformer/util/pointer";

export function transformClassConstructor(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	ptr: Pointer<luau.AnyIdentifier>,
	originNode?: ts.ConstructorDeclaration & { body: ts.Block },
) {
	const statements = luau.list.make<luau.Statement>();

	let bodyStatements = originNode ? getStatements(originNode.body) : [];

	const isRoact = extendsRoactComponent(state, node);
	let removeFirstSuper = isRoact;

	let parameters = luau.list.make<luau.AnyIdentifier>();
	let hasDotDotDot = false;
	if (originNode) {
		const {
			statements: paramStatements,
			parameters: constructorParams,
			hasDotDotDot: constructorHasDotDotDot,
		} = transformParameters(state, originNode);
		luau.list.pushList(statements, paramStatements);
		parameters = constructorParams;
		hasDotDotDot = constructorHasDotDotDot;
	} else if (getExtendsNode(node)) {
		// if extends + no constructor:
		// - add ... to params
		// - add super.constructor(self, ...)
		hasDotDotDot = true;
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
						expression: luau.globals.super,
						name: "constructor",
					}),
					args: luau.list.make<luau.Expression>(
						luau.globals.self,
						luau.create(luau.SyntaxKind.VarArgsLiteral, {}),
					),
				}),
			}),
		);
	}

	// property parameters must come after the first super() call
	function transformFirstSuper() {
		if (!removeFirstSuper) {
			removeFirstSuper = true;
			if (bodyStatements.length > 0) {
				const firstStatement = bodyStatements[0];
				if (ts.isExpressionStatement(firstStatement) && ts.isSuperCall(firstStatement.expression)) {
					luau.list.pushList(statements, transformStatementList(state, [firstStatement]));
				}
			}
		}
	}

	for (const parameter of originNode?.parameters ?? []) {
		if (ts.isParameterPropertyDeclaration(parameter, parameter.parent)) {
			transformFirstSuper();
			const paramId = transformIdentifierDefined(state, parameter.name);
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
						expression: luau.globals.self,
						name: paramId.name,
					}),
					operator: "=",
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
				continue;
			}

			const initializer = member.initializer;
			if (!initializer) {
				continue;
			}

			const [index, indexPrereqs] = state.capture(() => transformObjectKey(state, name));
			luau.list.pushList(statements, indexPrereqs);

			const [right, rightPrereqs] = state.capture(() => transformExpression(state, initializer));
			luau.list.pushList(statements, rightPrereqs);

			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: luau.globals.self,
						index,
					}),
					operator: "=",
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

	luau.list.pushList(statements, transformStatementList(state, bodyStatements));

	return luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.MethodDeclaration, {
			expression: ptr.value,
			name: isRoact ? "init" : "constructor",
			statements,
			parameters,
			hasDotDotDot,
		}),
	);
}
