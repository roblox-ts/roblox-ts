import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { getStatements } from "TSTransformer/util/getStatements";
import ts from "typescript";

const CONSTRUCTOR = "constructor";

function transformPropertyInitializers(state: TransformState, node: ts.ClassLikeDeclaration) {
	const statements = luau.list.make<luau.Statement>();
	for (const member of node.members) {
		if (!ts.isPropertyDeclaration(member)) continue;
		if (ts.hasStaticModifier(member)) continue;

		const name = member.name;
		if (ts.isPrivateIdentifier(name)) {
			DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(node));
			continue;
		}

		const initializer = member.initializer;
		if (!initializer) continue;

		const [index, indexPrereqs] = state.capture(() => transformPropertyName(state, name));
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
	return statements;
}

export function transformImplicitClassConstructor(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	name: luau.AnyIdentifier,
) {
	const statements = luau.list.make<luau.Statement>();

	let hasDotDotDot = false;

	// if extends + no constructor:
	// - add ... to params
	// - add super.constructor(self, ...)
	if (getExtendsNode(node)) {
		hasDotDotDot = true;
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(luau.property(luau.globals.super, CONSTRUCTOR), [
					luau.globals.self,
					luau.create(luau.SyntaxKind.VarArgsLiteral, {}),
				]),
			}),
		);
	}

	luau.list.pushList(statements, transformPropertyInitializers(state, node));

	return luau.list.make(
		luau.create(luau.SyntaxKind.MethodDeclaration, {
			expression: name,
			name: CONSTRUCTOR,
			statements,
			parameters: luau.list.make(),
			hasDotDotDot,
		}),
	);
}

export function transformClassConstructor(
	state: TransformState,
	node: ts.ConstructorDeclaration & { body: ts.Block },
	name: luau.AnyIdentifier,
) {
	const { statements, parameters, hasDotDotDot } = transformParameters(state, node);
	const bodyStatements = getStatements(node.body);

	// property parameters must come after the first super() call
	const superIndex = bodyStatements.findIndex(v => ts.isExpressionStatement(v) && ts.isSuperCall(v.expression));

	luau.list.pushList(statements, transformStatementList(state, node.body, bodyStatements.slice(0, superIndex + 1)));

	for (const parameter of node.parameters) {
		if (ts.isParameterPropertyDeclaration(parameter, parameter.parent)) {
			const paramId = transformIdentifierDefined(state, parameter.name);
			luau.list.push(
				statements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.property(luau.globals.self, paramId.name),
					operator: "=",
					right: paramId,
				}),
			);
		}
	}

	luau.list.pushList(statements, transformPropertyInitializers(state, node.parent));

	luau.list.pushList(statements, transformStatementList(state, node.body, bodyStatements.slice(superIndex + 1)));

	return luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.MethodDeclaration, {
			expression: name,
			name: CONSTRUCTOR,
			statements,
			parameters,
			hasDotDotDot,
		}),
	);
}
