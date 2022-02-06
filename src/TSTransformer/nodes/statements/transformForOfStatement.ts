import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformArrayAssignmentPattern } from "TSTransformer/nodes/binding/transformArrayAssignmentPattern";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";
import { transformObjectAssignmentPattern } from "TSTransformer/nodes/binding/transformObjectAssignmentPattern";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { getStatements } from "TSTransformer/util/getStatements";
import { skipDownwards } from "TSTransformer/util/traversal";
import {
	getTypeArguments,
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isIterableType,
	isMapType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import ts from "typescript";

type LoopBuilder = (
	state: TransformState,
	statements: luau.List<luau.Statement>,
	initializer: ts.ForInitializer,
	exp: luau.Expression,
) => luau.List<luau.Statement>;

function makeForLoopBuilder(
	callback: (
		state: TransformState,
		initializer: ts.ForInitializer,
		exp: luau.Expression,
		ids: luau.List<luau.AnyIdentifier>,
		initializers: luau.List<luau.Statement>,
	) => luau.Expression,
): LoopBuilder {
	return (state, statements, name, exp) => {
		const ids = luau.list.make<luau.AnyIdentifier>();
		const initializers = luau.list.make<luau.Statement>();
		const expression = callback(state, name, exp, ids, initializers);
		luau.list.unshiftList(statements, initializers);
		return luau.list.make(luau.create(luau.SyntaxKind.ForStatement, { ids, expression, statements }));
	};
}

function transformForInitializerExpressionDirect(
	state: TransformState,
	initializer: ts.Expression,
	initializers: luau.List<luau.Statement>,
	value: luau.Expression,
) {
	if (ts.isArrayLiteralExpression(initializer)) {
		const [parentId, prereqs] = state.capture(() => {
			const parentId = state.pushToVar(value, "binding");
			transformArrayAssignmentPattern(state, initializer, parentId);
			return parentId;
		});
		luau.list.pushList(initializers, prereqs);
		return parentId;
	} else if (ts.isObjectLiteralExpression(initializer)) {
		const [parentId, prereqs] = state.capture(() => {
			const parentId = state.pushToVar(value, "binding");
			transformObjectAssignmentPattern(state, initializer, parentId);
			return parentId;
		});
		luau.list.pushList(initializers, prereqs);
		return parentId;
	} else {
		const expression = transformWritableExpression(state, initializer, false);
		luau.list.push(
			initializers,
			luau.create(luau.SyntaxKind.Assignment, {
				left: expression,
				operator: "=",
				right: value,
			}),
		);
	}
}

function transformForInitializer(
	state: TransformState,
	initializer: ts.ForInitializer,
	initializers: luau.List<luau.Statement>,
) {
	if (ts.isVariableDeclarationList(initializer)) {
		return transformBindingName(state, initializer.declarations[0].name, initializers);
	} else if (ts.isArrayLiteralExpression(initializer)) {
		const parentId = luau.tempId("binding");
		luau.list.pushList(
			initializers,
			state.capturePrereqs(() => transformArrayAssignmentPattern(state, initializer, parentId)),
		);
		return parentId;
	} else if (ts.isObjectLiteralExpression(initializer)) {
		const parentId = luau.tempId("binding");
		luau.list.pushList(
			initializers,
			state.capturePrereqs(() => transformObjectAssignmentPattern(state, initializer, parentId)),
		);
		return parentId;
	} else {
		const valueId = luau.tempId("v");
		const expression = transformWritableExpression(state, initializer, false);
		luau.list.push(
			initializers,
			luau.create(luau.SyntaxKind.Assignment, {
				left: expression,
				operator: "=",
				right: valueId,
			}),
		);
		return valueId;
	}
}

const buildArrayLoop: LoopBuilder = makeForLoopBuilder((state, initializer, exp, ids, initializers) => {
	luau.list.push(ids, luau.tempId());
	luau.list.push(ids, transformForInitializer(state, initializer, initializers));
	return luau.call(luau.globals.ipairs, [exp]);
});

const buildSetLoop: LoopBuilder = makeForLoopBuilder((state, initializer, exp, ids, initializers) => {
	luau.list.push(ids, transformForInitializer(state, initializer, initializers));
	return luau.call(luau.globals.pairs, [exp]);
});

function transformInLineArrayBindingPattern(
	state: TransformState,
	pattern: ts.ArrayBindingPattern,
	ids: luau.List<luau.AnyIdentifier>,
	initializers: luau.List<luau.Statement>,
) {
	for (const element of pattern.elements) {
		if (ts.isOmittedExpression(element)) {
			luau.list.push(ids, luau.tempId());
		} else if (ts.isSpreadElement(element)) {
			DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
		} else {
			const id = transformBindingName(state, element.name, initializers);
			if (element.initializer) {
				luau.list.push(initializers, transformInitializer(state, id, element.initializer));
			}
			luau.list.push(ids, id);
		}
	}
}

function transformInLineArrayAssignmentPattern(
	state: TransformState,
	assignmentPattern: ts.ArrayLiteralExpression,
	ids: luau.List<luau.AnyIdentifier>,
	initializers: luau.List<luau.Statement>,
) {
	luau.list.pushList(
		initializers,
		state.capturePrereqs(() => {
			for (let element of assignmentPattern.elements) {
				if (ts.isOmittedExpression(element)) {
					luau.list.push(ids, luau.tempId());
				} else if (ts.isSpreadElement(element)) {
					DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
				} else {
					let initializer: ts.Expression | undefined;
					if (ts.isBinaryExpression(element)) {
						initializer = skipDownwards(element.right);
						element = skipDownwards(element.left);
					}

					const valueId = luau.tempId("binding");
					if (
						ts.isIdentifier(element) ||
						ts.isElementAccessExpression(element) ||
						ts.isPropertyAccessExpression(element)
					) {
						const id = transformWritableExpression(state, element, initializer !== undefined);
						state.prereq(
							luau.create(luau.SyntaxKind.Assignment, {
								left: id,
								operator: "=",
								right: valueId,
							}),
						);
						if (initializer) {
							state.prereq(transformInitializer(state, id, initializer));
						}
					} else if (ts.isArrayLiteralExpression(element)) {
						if (initializer) {
							state.prereq(transformInitializer(state, valueId, initializer));
						}
						transformArrayAssignmentPattern(state, element, valueId);
					} else if (ts.isObjectLiteralExpression(element)) {
						if (initializer) {
							state.prereq(transformInitializer(state, valueId, initializer));
						}
						transformObjectAssignmentPattern(state, element, valueId);
					} else {
						assert(false);
					}

					luau.list.push(ids, valueId);
				}
			}
		}),
	);
}

const buildMapLoop: LoopBuilder = makeForLoopBuilder((state, initializer, exp, ids, initializers) => {
	// TEST
	if (ts.isVariableDeclarationList(initializer)) {
		const name = initializer.declarations[0].name;
		if (ts.isArrayBindingPattern(name)) {
			transformInLineArrayBindingPattern(state, name, ids, initializers);
			return luau.call(luau.globals.pairs, [exp]);
		}
	} else if (ts.isArrayLiteralExpression(initializer)) {
		transformInLineArrayAssignmentPattern(state, initializer, ids, initializers);
		return luau.call(luau.globals.pairs, [exp]);
	}

	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");
	luau.list.push(ids, keyId);
	luau.list.push(ids, valueId);

	if (ts.isVariableDeclarationList(initializer)) {
		const bindingList = luau.list.make<luau.Statement>();
		luau.list.push(
			initializers,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: transformForInitializer(state, initializer, bindingList),
				right: luau.array([keyId, valueId]),
			}),
		);
		luau.list.pushList(initializers, bindingList);
	} else {
		transformForInitializerExpressionDirect(state, initializer, initializers, luau.array([keyId, valueId]));
	}

	return luau.call(luau.globals.pairs, [exp]);
});

const buildStringLoop: LoopBuilder = makeForLoopBuilder((state, initializer, exp, ids, initializers) => {
	luau.list.push(ids, transformForInitializer(state, initializer, initializers));
	return luau.call(luau.globals.string.gmatch, [exp, luau.globals.utf8.charpattern]);
});

const buildIterableFunctionLoop: LoopBuilder = makeForLoopBuilder((state, initializer, exp, ids, initializers) => {
	luau.list.push(ids, transformForInitializer(state, initializer, initializers));
	return exp;
});

function makeIterableFunctionLuaTupleShorthand(
	state: TransformState,
	array: ts.ArrayBindingPattern | ts.ArrayLiteralExpression,
	statements: luau.List<luau.Statement>,
	expression: luau.Expression,
) {
	const ids = luau.list.make<luau.AnyIdentifier>();
	const initializers = luau.list.make<luau.Statement>();
	if (ts.isArrayBindingPattern(array)) {
		transformInLineArrayBindingPattern(state, array, ids, initializers);
	} else {
		transformInLineArrayAssignmentPattern(state, array, ids, initializers);
	}
	luau.list.unshiftList(statements, initializers);
	return luau.list.make(luau.create(luau.SyntaxKind.ForStatement, { ids, expression, statements }));
}

const buildIterableFunctionLuaTupleLoop: (type: ts.Type) => LoopBuilder =
	type => (state, statements, initializer, exp) => {
		if (ts.isVariableDeclarationList(initializer)) {
			// for (const [a, b] of iter())
			const name = initializer.declarations[0].name;
			if (ts.isArrayBindingPattern(name)) {
				return makeIterableFunctionLuaTupleShorthand(state, name, statements, exp);
			}
		} else if (ts.isArrayLiteralExpression(initializer)) {
			// for ([a, b] of iter())
			return makeIterableFunctionLuaTupleShorthand(state, initializer, statements, exp);
		}

		const iteratorReturnIds = new Array<luau.TemporaryIdentifier>();

		// get call signature of IterableFunction<T> which is `(): T`
		// and get return type of call signature which is `T`
		const luaTupleType = type.getCallSignatures()[0].getReturnType();
		assert(
			luaTupleType && luaTupleType.aliasTypeArguments && luaTupleType.aliasTypeArguments.length === 1,
			"Incorrect LuaTuple<T> type arguments",
		);
		const tupleArgType = luaTupleType.aliasTypeArguments[0];
		// if LuaTuple has defined element amount
		// and initializer is a variable declaration `for (const a of iter())`
		// then use lua for-in loop, specifying all elements and putting them in table
		if (state.typeChecker.isTupleType(tupleArgType) && ts.isVariableDeclarationList(initializer)) {
			const typeArguments = getTypeArguments(state, tupleArgType);
			for (let i = 0; i < typeArguments.length; i++) {
				// TODO: Name TempIds after tuple elements if labeled
				iteratorReturnIds.push(luau.tempId("element"));
			}
		} else {
			const iterFuncId = state.pushToVar(exp, "iterFunc");
			const loopStatements = luau.list.make<luau.Statement>();

			const initializerStatements = luau.list.make<luau.Statement>();
			const valueId = transformForInitializer(state, initializer, initializerStatements);

			luau.list.push(
				loopStatements,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: valueId,
					right: luau.array([luau.call(iterFuncId)]),
				}),
			);

			luau.list.push(
				loopStatements,
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.binary(luau.unary("#", valueId), "==", luau.number(0)),
					statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
					elseBody: luau.list.make(),
				}),
			);

			luau.list.pushList(loopStatements, initializerStatements);

			luau.list.pushList(loopStatements, statements);

			return luau.list.make(
				luau.create(luau.SyntaxKind.WhileStatement, {
					condition: luau.bool(true),
					statements: loopStatements,
				}),
			);
		}

		const tupleId = transformForInitializer(state, initializer, statements);

		const builder = makeForLoopBuilder((state, initializer, exp, ids, initializers) => {
			for (const id of iteratorReturnIds) {
				luau.list.push(ids, id);
			}

			luau.list.push(
				initializers,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: tupleId,
					right: luau.array(iteratorReturnIds),
				}),
			);
			return exp;
		});

		return builder(state, statements, initializer, exp);
	};

const buildGeneratorLoop: LoopBuilder = makeForLoopBuilder((state, initializer, exp, ids, initializers) => {
	const loopId = luau.tempId("result");
	luau.list.push(ids, loopId);

	luau.list.push(
		initializers,
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.property(loopId, "done"),
			statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
			elseBody: luau.list.make(),
		}),
	);

	if (ts.isVariableDeclarationList(initializer)) {
		const bindingList = luau.list.make<luau.Statement>();
		luau.list.push(
			initializers,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: transformForInitializer(state, initializer, bindingList),
				right: luau.property(loopId, "value"),
			}),
		);
		luau.list.pushList(initializers, bindingList);
	} else {
		transformForInitializerExpressionDirect(state, initializer, initializers, luau.property(loopId, "value"));
	}

	return luau.property(convertToIndexableExpression(exp), "next");
});

function getLoopBuilder(state: TransformState, node: ts.Node, type: ts.Type): LoopBuilder {
	if (isDefinitelyType(state, type, node, isArrayType(state))) {
		return buildArrayLoop;
	} else if (isDefinitelyType(state, type, node, isSetType(state))) {
		return buildSetLoop;
	} else if (isDefinitelyType(state, type, node, isMapType(state))) {
		return buildMapLoop;
	} else if (isDefinitelyType(state, type, node, isStringType)) {
		return buildStringLoop;
	} else if (isDefinitelyType(state, type, node, isIterableFunctionLuaTupleType(state))) {
		return buildIterableFunctionLuaTupleLoop(type);
	} else if (isDefinitelyType(state, type, node, isIterableFunctionType(state))) {
		return buildIterableFunctionLoop;
	} else if (isDefinitelyType(state, type, node, isGeneratorType(state))) {
		return buildGeneratorLoop;
	} else if (isDefinitelyType(state, type, node, isIterableType(state))) {
		DiagnosticService.addDiagnostic(errors.noIterableIteration(node));
		return () => luau.list.make();
	} else {
		// TODO: Check for the type's `[Symbol.iterator]` property and use that
		// Known failure case: iterating over a class with a custom `[Symbol.iterator]` method
		assert(false, `ForOf iteration type not implemented: ${state.typeChecker.typeToString(type)}`);
	}
}

export function transformForOfStatement(state: TransformState, node: ts.ForOfStatement): luau.List<luau.Statement> {
	if (node.awaitModifier) {
		DiagnosticService.addDiagnostic(errors.noAwaitForOf(node));
	}

	if (ts.isVariableDeclarationList(node.initializer)) {
		const name = node.initializer.declarations[0].name;
		if (ts.isIdentifier(name)) {
			validateIdentifier(state, name);
		}
	}

	const result = luau.list.make<luau.Statement>();

	const [exp, expPrereqs] = state.capture(() => transformExpression(state, node.expression));
	luau.list.pushList(result, expPrereqs);

	const expType = state.getType(node.expression);
	const statements = transformStatementList(state, getStatements(node.statement));

	const loopBuilder = getLoopBuilder(state, node.expression, expType);
	luau.list.pushList(result, loopBuilder(state, statements, node.initializer, exp));

	return result;
}
