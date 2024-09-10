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

export function transformClassConstructor(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	name: luau.AnyIdentifier,
	originNode?: ts.ConstructorDeclaration & { body: ts.Block },
) {
	const statements = luau.list.make<luau.Statement>();

	const body = originNode?.body;
	const bodyStatements = body ? getStatements(body) : [];

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
				expression: luau.call(luau.property(luau.globals.super, "constructor"), [
					luau.globals.self,
					luau.create(luau.SyntaxKind.VarArgsLiteral, {}),
				]),
			}),
		);
	}

	// property parameters must come after the first super() call
	const superIndex = bodyStatements.findIndex(v => ts.isExpressionStatement(v) && ts.isSuperCall(v.expression));

	luau.list.pushList(statements, transformStatementList(state, body, bodyStatements.slice(0, superIndex + 1)));

	for (const parameter of originNode?.parameters ?? []) {
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

	for (const member of node.members) {
		if (ts.isPropertyDeclaration(member) && !ts.hasStaticModifier(member)) {
			const name = member.name;
			if (ts.isPrivateIdentifier(name)) {
				DiagnosticService.addDiagnostic(errors.noPrivateIdentifier(node));
				continue;
			}

			const initializer = member.initializer;
			if (!initializer) {
				continue;
			}

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
	}

	luau.list.pushList(statements, transformStatementList(state, body, bodyStatements.slice(superIndex + 1)));

	return luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.MethodDeclaration, {
			expression: name,
			name: "constructor",
			statements,
			parameters,
			hasDotDotDot,
		}),
	);
}
