import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformArrayBindingLiteral } from "TSTransformer/nodes/binding/transformArrayBindingLiteral";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";
import { transformObjectBindingLiteral } from "TSTransformer/nodes/binding/transformObjectBindingLiteral";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getSubType } from "TSTransformer/util/binding/getSubType";
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

function getForInitializerAccessType(state: TransformState, initializer: ts.ForInitializer) {
	const forOfStatement = initializer.parent;
	assert(ts.isForOfStatement(forOfStatement));
	return getSubType(state, state.getType(forOfStatement.expression), 0);
}

function transformForInitializerExpressionDirect(
	state: TransformState,
	initializer: ts.Expression,
	initializers: luau.List<luau.Statement>,
	value: luau.Expression,
) {
	if (ts.isArrayLiteralExpression(initializer)) {
		const [parentId, prereqs] = state.capture(() => {
			const parentId = state.pushToVar(value);
			transformArrayBindingLiteral(state, initializer, parentId, getForInitializerAccessType(state, initializer));
			return parentId;
		});
		luau.list.pushList(initializers, prereqs);
		return parentId;
	} else if (ts.isObjectLiteralExpression(initializer)) {
		const [parentId, prereqs] = state.capture(() => {
			const parentId = state.pushToVar(value);
			transformObjectBindingLiteral(
				state,
				initializer,
				parentId,
				getForInitializerAccessType(state, initializer),
			);
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
		const parentId = luau.tempId();
		luau.list.pushList(
			initializers,
			state.capturePrereqs(() =>
				transformArrayBindingLiteral(
					state,
					initializer,
					parentId,
					getForInitializerAccessType(state, initializer),
				),
			),
		);
		return parentId;
	} else if (ts.isObjectLiteralExpression(initializer)) {
		const parentId = luau.tempId();
		luau.list.pushList(
			initializers,
			state.capturePrereqs(() =>
				transformObjectBindingLiteral(
					state,
					initializer,
					parentId,
					getForInitializerAccessType(state, initializer),
				),
			),
		);
		return parentId;
	} else {
		const valueId = luau.tempId();
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
	luau.list.push(ids, luau.emptyId());
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
			luau.list.push(ids, luau.emptyId());
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

function transformInLineArrayBindingLiteral(
	state: TransformState,
	bindingLiteral: ts.ArrayLiteralExpression,
	ids: luau.List<luau.AnyIdentifier>,
	initializers: luau.List<luau.Statement>,
) {
	luau.list.pushList(
		initializers,
		state.capturePrereqs(() => {
			for (let element of bindingLiteral.elements) {
				if (ts.isOmittedExpression(element)) {
					luau.list.push(ids, luau.emptyId());
				} else if (ts.isSpreadElement(element)) {
					DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
				} else {
					let initializer: ts.Expression | undefined;
					if (ts.isBinaryExpression(element)) {
						initializer = skipDownwards(element.right);
						element = skipDownwards(element.left);
					}

					const valueId = luau.tempId();
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
						transformArrayBindingLiteral(state, element, valueId, state.getType(element));
					} else if (ts.isObjectLiteralExpression(element)) {
						if (initializer) {
							state.prereq(transformInitializer(state, valueId, initializer));
						}
						transformObjectBindingLiteral(state, element, valueId, state.getType(element));
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
		transformInLineArrayBindingLiteral(state, initializer, ids, initializers);
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

const buildIterableFunctionLuaTupleLoop: (type: ts.Type) => LoopBuilder =
	type => (state, statements, initializer, exp) => {
		if (ts.isVariableDeclarationList(initializer)) {
			const name = initializer.declarations[0].name;
			if (ts.isArrayBindingPattern(name)) {
				const ids = luau.list.make<luau.AnyIdentifier>();
				const initializers = luau.list.make<luau.Statement>();
				transformInLineArrayBindingPattern(state, name, ids, initializers);
				luau.list.unshiftList(statements, initializers);
				return luau.list.make(luau.create(luau.SyntaxKind.ForStatement, { ids, expression: exp, statements }));
			}
		} else if (ts.isArrayLiteralExpression(initializer)) {
			const ids = luau.list.make<luau.AnyIdentifier>();
			const initializers = luau.list.make<luau.Statement>();
			transformInLineArrayBindingLiteral(state, initializer, ids, initializers);
			luau.list.unshiftList(statements, initializers);
			return luau.list.make(luau.create(luau.SyntaxKind.ForStatement, { ids, expression: exp, statements }));
		} else {
			DiagnosticService.addDiagnostic(errors.noForOfLuaTupleAssignment(initializer.parent));
		}

		const iteratorReturnIds = new Array<luau.TemporaryIdentifier>();

		const luaTupleType = getTypeArguments(state, type)[0];
		assert(
			luaTupleType.aliasTypeArguments && luaTupleType.aliasTypeArguments.length > 0,
			"No LuaTuple<T> type arguments",
		);
		const tupleArgType = luaTupleType.aliasTypeArguments[0];

		if (state.typeChecker.isTupleType(tupleArgType)) {
			const typeArguments = getTypeArguments(state, tupleArgType);
			for (let i = 0; i < typeArguments.length; i++) {
				// TODO: Name TempIds after tuple elements if labeled
				iteratorReturnIds.push(luau.tempId("element"));
			}
		} else {
			const iterFuncId = state.pushToVar(exp);
			const loopStatements = luau.list.make<luau.Statement>();

			const valueId = transformForInitializer(state, initializer, loopStatements);

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
	if (isDefinitelyType(type, t => isArrayType(state, t))) {
		return buildArrayLoop;
	} else if (isDefinitelyType(type, t => isSetType(state, t))) {
		return buildSetLoop;
	} else if (isDefinitelyType(type, t => isMapType(state, t))) {
		return buildMapLoop;
	} else if (isDefinitelyType(type, t => isStringType(t))) {
		return buildStringLoop;
	} else if (isDefinitelyType(type, t => isIterableFunctionLuaTupleType(state, t))) {
		return buildIterableFunctionLuaTupleLoop(type);
	} else if (isDefinitelyType(type, t => isIterableFunctionType(state, t))) {
		return buildIterableFunctionLoop;
	} else if (isDefinitelyType(type, t => isGeneratorType(state, t))) {
		return buildGeneratorLoop;
	} else if (isDefinitelyType(type, t => isIterableType(state, t))) {
		DiagnosticService.addDiagnostic(errors.noIterableIteration(node));
		return () => luau.list.make();
	} else if (type.isUnion()) {
		DiagnosticService.addDiagnostic(errors.noMacroUnion(node));
		return () => luau.list.make();
	} else {
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
