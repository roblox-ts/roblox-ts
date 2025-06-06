import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
import { findConstructor } from "TSTransformer/util/findConstructor";
import ts from "typescript";

type HasDecorators = Exclude<ts.HasDecorators, ts.AccessorDeclaration>;

function countDecorators(node: HasDecorators) {
	return ts.getDecorators(node)?.length ?? 0;
}

function shouldInline(
	state: TransformState,
	isLastDecorator: boolean,
	decorator: ts.Decorator,
	expression: luau.Expression,
): boolean {
	// immutable expressions can be inlined
	if (!expressionMightMutate(state, expression, decorator.expression)) return true;

	// if it's not the last decorator, we can't inline
	// this is because we need to initialize all decorators before running them
	if (!isLastDecorator) return false;

	const node = decorator.parent;

	// if the node is a method declaration and has a decorator on a parameter, we can't inline
	// this is because we need to run parameter decorators between initializing and running method decorators
	if (ts.isMethodDeclaration(node) && node.parameters.some(parameter => countDecorators(parameter) > 0)) return false;

	// if the node is a class declaration and has a decorator on a constructor parameter, we can't inline
	// this is because we need to run constructor parameter decorators between initializing and running class decorators
	if (ts.isClassLike(node)) {
		const constructor = findConstructor(node);
		if (constructor && constructor.parameters.some(parameter => countDecorators(parameter) > 0)) return false;
	}

	// if the node is a parameter and there are any parameters with decorators after it, we can't inline
	// this ensures all of the parameters are initialized before running any, including from sibling parameters
	if (ts.isParameter(node)) {
		const parameters = node.parent.parameters;
		const paramIdx = parameters.findIndex(param => param === node);
		for (let i = paramIdx + 1; i < parameters.length; i++) {
			if (countDecorators(parameters[i]) > 0) {
				return false;
			}
		}
	}

	return true;
}

function transformMemberDecorators(
	state: TransformState,
	node: HasDecorators,
	callback: (expression: luau.IndexableExpression) => luau.List<luau.Statement>,
): [initializers: luau.List<luau.Statement>, finalizers: luau.List<luau.Statement>] {
	const initializers = luau.list.make<luau.Statement>();
	const finalizers = luau.list.make<luau.Statement>();

	const decorators = ts.getDecorators(node) ?? [];

	for (let i = 0; i < decorators.length; i++) {
		const decorator = decorators[i];
		let [expression, prereqs] = state.capture(() => transformExpression(state, decorator.expression));

		luau.list.pushList(initializers, prereqs);

		const isLastDecorator = i === decorators.length - 1;

		if (!shouldInline(state, isLastDecorator, decorator, expression)) {
			const tempId = luau.tempId("decorator");
			luau.list.push(
				initializers,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: tempId,
					right: expression,
				}),
			);
			expression = tempId;
		}

		luau.list.unshiftList(finalizers, callback(convertToIndexableExpression(expression)));
	}

	return [initializers, finalizers];
}

function transformMethodDecorators(
	state: TransformState,
	member: ts.MethodDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const [initializers, finalizers] = transformMemberDecorators(state, member, expression => {
		const result = luau.list.make<luau.Statement>();

		// local _descriptor = decorator(Class, "name", { value = Class.name })
		// if _descriptor then
		// 	Class.name = _descriptor.value
		// end

		const descriptorId = luau.tempId("descriptor");
		const key = state.getClassElementObjectKey(member);
		assert(key, "Did not find method key for method decorator");

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

	const result = luau.list.make<luau.Statement>();
	luau.list.pushList(result, initializers);
	luau.list.pushList(result, transformParameterDecorators(state, member, classId));
	luau.list.pushList(result, finalizers);
	return result;
}

function transformPropertyDecorators(
	state: TransformState,
	member: ts.PropertyDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const [initializers, finalizers] = transformMemberDecorators(state, member, expression => {
		// typescript enforces that property keys are static, so they shouldn't have prereqs
		const key = state.noPrereqs(() => transformPropertyName(state, member.name));

		// decorator(Class, "name")
		return luau.list.make(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: luau.call(expression, [classId, key]),
			}),
		);
	});

	const result = luau.list.make<luau.Statement>();
	luau.list.pushList(result, initializers);
	luau.list.pushList(result, finalizers);
	return result;
}

function transformParameterDecorators(
	state: TransformState,
	member: ts.MethodDeclaration | ts.ConstructorDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const initializers = luau.list.make<luau.Statement>();
	const finalizers = luau.list.make<luau.Statement>();

	for (let i = 0; i < member.parameters.length; i++) {
		const parameter = member.parameters[i];
		const [paramInitializers, paramFinalizers] = transformMemberDecorators(state, parameter, expression => {
			// No member.name means it's the constructor, so the name argument should be nil
			const key = member.name ? state.getClassElementObjectKey(member) : luau.nil();
			assert(key, "Did not find method key for parameter decorator");

			// decorator(Class, "name", 0)
			return luau.list.make(
				luau.create(luau.SyntaxKind.CallStatement, {
					expression: luau.call(expression, [classId, key, luau.number(i)]),
				}),
			);
		});
		luau.list.pushList(initializers, paramInitializers);
		luau.list.unshiftList(finalizers, paramFinalizers);
	}

	const result = luau.list.make<luau.Statement>();
	luau.list.pushList(result, initializers);
	luau.list.pushList(result, finalizers);
	return result;
}

function transformClassDecorators(
	state: TransformState,
	node: ts.ClassLikeDeclaration,
	classId: luau.AnyIdentifier,
): luau.List<luau.Statement> {
	const [initializers, finalizers] = transformMemberDecorators(state, node, expression =>
		// Class = decorator(Class) or Class
		luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: classId,
				operator: "=",
				right: luau.binary(luau.call(expression, [classId]), "or", classId),
			}),
		),
	);

	const result = luau.list.make<luau.Statement>();
	luau.list.pushList(result, initializers);

	const constructor = findConstructor(node);
	if (constructor) {
		luau.list.pushList(result, transformParameterDecorators(state, constructor, classId));
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
		if (!ts.hasStaticModifier(member)) {
			// check `member.body` to skip overload signatures because decorators are not valid on them
			if (ts.isMethodDeclaration(member) && member.body) {
				luau.list.pushList(result, transformMethodDecorators(state, member, classId));
			} else if (ts.isPropertyDeclaration(member)) {
				luau.list.pushList(result, transformPropertyDecorators(state, member, classId));
			}
		}
	}

	// Static Decorators
	for (const member of node.members) {
		if (ts.hasStaticModifier(member)) {
			// check `member.body` to skip overload signatures because decorators are not valid on them
			if (ts.isMethodDeclaration(member) && member.body) {
				luau.list.pushList(result, transformMethodDecorators(state, member, classId));
			} else if (ts.isPropertyDeclaration(member)) {
				luau.list.pushList(result, transformPropertyDecorators(state, member, classId));
			}
		}
	}

	// Class Decorators
	luau.list.pushList(result, transformClassDecorators(state, node, classId));

	return result;
}
