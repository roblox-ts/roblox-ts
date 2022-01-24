import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformObjectKey } from "TSTransformer/nodes/transformObjectKey";
import ts from "typescript";

function transformMethodDecorators(
	state: TransformState,
	member: ts.MethodDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();
	const finalizers = luau.list.make<luau.Statement>();

	const multipleDecorators = member.decorators !== undefined && member.decorators.length > 1;

	const name = member.name;
	if (name && !ts.isPrivateIdentifier(name)) {
		for (const decorator of member.decorators ?? []) {
			// eslint-disable-next-line no-autofix/prefer-const
			let [expression, prereqs] = state.capture(() => transformExpression(state, decorator.expression));

			luau.list.pushList(result, prereqs);

			if (multipleDecorators && !luau.isSimple(expression)) {
				const tempId = luau.tempId("decorator");
				luau.list.push(
					result,
					luau.create(luau.SyntaxKind.VariableDeclaration, {
						left: tempId,
						right: expression,
					}),
				);
				expression = tempId;
			}

			assert(luau.isIndexableExpression(expression));

			let key: luau.Expression | undefined = state.getClassElementObjectKey(member);
			if (key === undefined) {
				let keyPrereqs: luau.List<luau.Statement>;
				[key, keyPrereqs] = state.capture(() => transformObjectKey(state, name));
				luau.list.pushList(result, keyPrereqs);
			}

			const decoratorStatements = luau.list.make<luau.Statement>();

			// local _descriptor = decorator(Class, "name", { value = Class.name })
			// if _descriptor then
			// 	Class.name = _descriptor.value
			// end
			const descriptorId = luau.tempId("descriptor");

			luau.list.push(
				decoratorStatements,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: descriptorId,
					right: luau.call(expression, [
						classId,
						key,
						luau.map([
							[
								luau.string("value"),
								luau.create(luau.SyntaxKind.ComputedIndexExpression, {
									expression: classId,
									index: key,
								}),
							],
						]),
					]),
				}),
			);

			luau.list.push(
				decoratorStatements,
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: descriptorId,
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: classId,
								index: key,
							}),
							operator: "=",
							right: luau.property(descriptorId, "value"),
						}),
					),
					elseBody: luau.list.make(),
				}),
			);

			luau.list.unshiftList(finalizers, decoratorStatements);
		}
	}

	luau.list.pushList(result, finalizers);

	return result;
}

function transformPropertyDecorators(
	state: TransformState,
	member: ts.PropertyDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();
	const finalizers = luau.list.make<luau.Statement>();

	const multipleDecorators = member.decorators !== undefined && member.decorators.length > 1;

	const name = member.name;
	if (name && !ts.isPrivateIdentifier(name)) {
		for (const decorator of member.decorators ?? []) {
			// eslint-disable-next-line no-autofix/prefer-const
			let [expression, prereqs] = state.capture(() => transformExpression(state, decorator.expression));

			luau.list.pushList(result, prereqs);

			if (multipleDecorators && !luau.isSimple(expression)) {
				const tempId = luau.tempId("decorator");
				luau.list.push(
					result,
					luau.create(luau.SyntaxKind.VariableDeclaration, {
						left: tempId,
						right: expression,
					}),
				);
				expression = tempId;
			}

			assert(luau.isIndexableExpression(expression));

			const [key, keyPrereqs] = state.capture(() => transformObjectKey(state, name));
			luau.list.pushList(result, keyPrereqs);

			// decorator(Class, "name")
			luau.list.unshift(
				finalizers,
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(expression, [classId, key]),
				}),
			);
		}
	}

	luau.list.pushList(result, finalizers);

	return result;
}

function transformParameterDecorators(
	state: TransformState,
	member: ts.MethodDeclaration | ts.ConstructorDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();

	for (let i = 0; i < member.parameters.length; i++) {
		const parameter = member.parameters[i];
		if (ts.isIdentifier(parameter.name)) {
			const finalizers = luau.list.make<luau.Statement>();
			const multipleDecorators = member.decorators !== undefined && member.decorators.length > 1;
			for (const decorator of parameter.decorators ?? []) {
				// eslint-disable-next-line no-autofix/prefer-const
				let [expression, prereqs] = state.capture(() => transformExpression(state, decorator.expression));

				luau.list.pushList(result, prereqs);

				if (multipleDecorators && !luau.isSimple(expression)) {
					const tempId = luau.tempId("decorator");
					luau.list.push(
						result,
						luau.create(luau.SyntaxKind.VariableDeclaration, {
							left: tempId,
							right: expression,
						}),
					);
					expression = tempId;
				}

				assert(luau.isIndexableExpression(expression));

				// decorator(Class, "name", 0)
				luau.list.unshift(
					finalizers,
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(expression, [classId, luau.string(parameter.name.text), luau.number(i)]),
					}),
				);
			}
			luau.list.pushList(result, finalizers);
		}
	}

	return result;
}

function transformClassDecorators(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();
	const finalizers = luau.list.make<luau.Statement>();

	const multipleDecorators = node.decorators !== undefined && node.decorators.length > 1;

	for (const decorator of node.decorators ?? []) {
		// eslint-disable-next-line no-autofix/prefer-const
		let [expression, prereqs] = state.capture(() => transformExpression(state, decorator.expression));

		luau.list.pushList(result, prereqs);

		if (multipleDecorators && !luau.isSimple(expression)) {
			const tempId = luau.tempId("decorator");
			luau.list.push(
				result,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: tempId,
					right: expression,
				}),
			);
			expression = tempId;
		}

		assert(luau.isIndexableExpression(expression));

		// Class = decorator(Class) or Class
		luau.list.unshift(
			finalizers,
			luau.create(luau.SyntaxKind.Assignment, {
				left: classId,
				operator: "=",
				right: luau.binary(luau.call(expression, [classId]), "or", classId),
			}),
		);
	}

	luau.list.pushList(result, finalizers);

	return result;
}

export function transformDecorators(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();

	// https://www.typescriptlang.org/docs/handbook/decorators.html#decorator-evaluation

	// Instance Decorators
	for (const member of node.members) {
		if (!ts.getSelectedSyntacticModifierFlags(member, ts.ModifierFlags.Static)) {
			if (ts.isMethodDeclaration(member)) {
				luau.list.pushList(result, transformMethodDecorators(state, member, classId));
				luau.list.pushList(result, transformParameterDecorators(state, member, classId));
			} else if (ts.isPropertyDeclaration(member)) {
				luau.list.pushList(result, transformPropertyDecorators(state, member, classId));
			}
		}
	}

	// Static Decorators
	for (const member of node.members) {
		if (!!ts.getSelectedSyntacticModifierFlags(member, ts.ModifierFlags.Static)) {
			if (ts.isMethodDeclaration(member)) {
				luau.list.pushList(result, transformMethodDecorators(state, member, classId));
				luau.list.pushList(result, transformParameterDecorators(state, member, classId));
			} else if (ts.isPropertyDeclaration(member)) {
				luau.list.pushList(result, transformPropertyDecorators(state, member, classId));
			}
		}
	}

	// Constructor Parameter Decorators
	for (const member of node.members) {
		if (ts.isConstructorDeclaration(member)) {
			luau.list.pushList(result, transformParameterDecorators(state, member, classId));
		}
	}

	// Class Decorators
	luau.list.pushList(result, transformClassDecorators(state, node, classId));

	return result;
}
