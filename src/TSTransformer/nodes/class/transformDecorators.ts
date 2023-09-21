import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";

function transformMemberDecorators(
	state: TransformState,
	node: ts.ClassLikeDeclaration | ts.MethodDeclaration | ts.PropertyDeclaration | ts.ParameterDeclaration,
	callback: (expression: luau.IndexableExpression, key?: luau.Expression) => luau.List<luau.Statement>,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();
	const finalizers = luau.list.make<luau.Statement>();

	const decorators = ts.getDecorators(node);
	const multipleDecorators = decorators !== undefined && decorators.length > 1;

	const name = node.name;
	if (!name || ts.isPrivateIdentifier(name)) return result;

	for (const decorator of decorators ?? []) {
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

		let key: luau.Expression | undefined;
		if (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) {
			key = state.getClassElementObjectKey(node);
			if (!key) {
				// `name` can be `ts.BindingPattern` if it's from a `ts.ParameterDeclaration`
				// we check against this above
				assert(!ts.isBindingPattern(name));
				const keyPrereqs = state.capturePrereqs(() => (key = transformPropertyName(state, name)));
				luau.list.pushList(result, keyPrereqs);
			}
		}

		luau.list.unshiftList(finalizers, callback(convertToIndexableExpression(expression), key));
	}

	luau.list.pushList(result, finalizers);

	return result;
}

function transformMethodDecorators(
	state: TransformState,
	member: ts.MethodDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	return transformMemberDecorators(state, member, (expression, key) => {
		assert(key);

		const result = luau.list.make<luau.Statement>();

		// local _descriptor = decorator(Class, "name", { value = Class.name })
		// if _descriptor then
		// 	Class.name = _descriptor.value
		// end

		const descriptorId = luau.tempId("descriptor");

		luau.list.push(
			result,
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
			result,
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

		return result;
	});
}

function transformPropertyDecorators(
	state: TransformState,
	member: ts.PropertyDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	return transformMemberDecorators(state, member, (expression, key) => {
		assert(key);

		// decorator(Class, "name")
		return luau.list.make(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(expression, [classId, key]),
			}),
		);
	});
}

function transformParameterDecorators(
	state: TransformState,
	member: ts.MethodDeclaration | ts.ConstructorDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();

	const memberName = member.name;
	let key: luau.Expression | undefined =
		memberName !== undefined ? state.getClassElementObjectKey(member) : luau.nil();
	if (!key) {
		const keyPrereqs = state.capturePrereqs(() => (key = transformPropertyName(state, memberName!)));
		luau.list.pushList(result, keyPrereqs);
	}

	for (let i = 0; i < member.parameters.length; i++) {
		const parameter = member.parameters[i];
		luau.list.pushList(
			result,
			transformMemberDecorators(state, parameter, expression =>
				// decorator(Class, "name", 0)
				luau.list.make(
					luau.create(luau.SyntaxKind.CallStatement, {
						expression: luau.call(expression, [classId, key!, luau.number(i)]),
					}),
				),
			),
		);
	}

	return result;
}

function transformClassDecorators(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	return transformMemberDecorators(state, node, expression =>
		// Class = decorator(Class) or Class
		luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: classId,
				operator: "=",
				right: luau.binary(luau.call(expression, [classId]), "or", classId),
			}),
		),
	);
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
