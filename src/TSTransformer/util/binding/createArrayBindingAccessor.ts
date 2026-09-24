import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import {
	isArrayType,
	isDefinitelyType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isIterableType,
	isMapType,
	isSetType,
	isSharedTableType,
	isStringType,
} from "TSTransformer/util/types";
import ts from "typescript";

interface BindingAccessor {
	read(prereqs: Prereqs, index: number, omitted: boolean): luau.Expression;
	rest(prereqs: Prereqs, index: number): luau.Expression;
}

interface IteratorStep {
	value: luau.Expression;
	done: luau.Expression;
}

function ifNotDone(done: luau.Expression, value: luau.Expression) {
	return luau.create(luau.SyntaxKind.IfExpression, {
		condition: done,
		expression: luau.nil(),
		alternative: value,
	});
}

// prefix elements and rest consume one iterator and share its terminal state
function createIteratorAccessor(
	step: (prereqs: Prereqs, omitted: boolean) => IteratorStep,
	hasCompletionValue: boolean,
): BindingAccessor {
	let doneId: luau.AnyIdentifier | undefined;

	return {
		read(prereqs, index, omitted) {
			const previousDone = doneId;
			const stepPrereqs = new Prereqs();
			const { value, done } = step(stepPrereqs, omitted);
			if (!previousDone) {
				doneId = stepPrereqs.pushToVar(done, "done");
				prereqs.pushList(stepPrereqs.statements);
				return omitted ? luau.none() : hasCompletionValue ? ifNotDone(doneId, value) : value;
			}

			const valueId = omitted ? undefined : prereqs.pushToVar(undefined, "value");
			stepPrereqs.push(
				luau.create(luau.SyntaxKind.Assignment, { left: previousDone, operator: "=", right: done }),
			);
			if (valueId) {
				stepPrereqs.push(
					luau.create(luau.SyntaxKind.Assignment, {
						left: valueId,
						operator: "=",
						right: hasCompletionValue ? ifNotDone(previousDone, value) : value,
					}),
				);
			}
			prereqs.push(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.unary("not", previousDone),
					statements: stepPrereqs.statements,
					elseBody: luau.list.make(),
				}),
			);
			return valueId ?? luau.none();
		},
		rest(prereqs) {
			const rest = prereqs.pushToVar(luau.array(), "rest");
			const restPrereqs = new Prereqs();
			const length = restPrereqs.pushToVar(luau.number(0), "length");
			const body = new Prereqs();
			const { value, done } = step(body, false);
			body.push(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: done,
					statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
					elseBody: luau.list.make(),
				}),
			);
			body.push(luau.create(luau.SyntaxKind.Assignment, { left: length, operator: "+=", right: luau.number(1) }));
			body.push(
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, { expression: rest, index: length }),
					operator: "=",
					right: value,
				}),
			);
			restPrereqs.push(
				luau.create(luau.SyntaxKind.WhileStatement, {
					condition: luau.bool(true),
					statements: body.statements,
				}),
			);
			if (doneId) {
				prereqs.push(
					luau.create(luau.SyntaxKind.IfStatement, {
						condition: luau.unary("not", doneId),
						statements: restPrereqs.statements,
						elseBody: luau.list.make(),
					}),
				);
			} else {
				prereqs.pushList(restPrereqs.statements);
			}
			return rest;
		},
	};
}

function createFunctionAccessor(iterator: luau.AnyIdentifier, tuple: boolean) {
	return createIteratorAccessor((prereqs, omitted) => {
		const call = luau.call(iterator);
		const value = prereqs.pushToVar(tuple && !omitted ? luau.array([call]) : call, "value");
		const first =
			tuple && !omitted
				? luau.create(luau.SyntaxKind.ComputedIndexExpression, { expression: value, index: luau.number(1) })
				: value;
		const done = luau.binary(first, "==", luau.nil());
		return { value, done };
	}, tuple);
}

function createCollectionAccessor(
	prereqs: Prereqs,
	parentId: luau.AnyIdentifier,
	map: boolean,
	elementCount: number,
): BindingAccessor {
	const key = prereqs.pushToVar(undefined, "key");
	let consumed: luau.AnyIdentifier | undefined;
	const accessor = createIteratorAccessor((prereqs, omitted) => {
		const member = map && !omitted ? prereqs.pushToVar(undefined, "value") : undefined;
		const advance = () =>
			luau.create(luau.SyntaxKind.Assignment, {
				left: member ? luau.list.make(key, member) : key,
				operator: "=",
				right: luau.call(luau.globals.next, [parentId, key]),
			});
		if (consumed) {
			// destination evaluation can remove the cursor and invalidate next's continuation key
			prereqs.push(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.binary(
						luau.binary(key, "~=", luau.nil()),
						"and",
						luau.binary(
							luau.create(luau.SyntaxKind.ComputedIndexExpression, { expression: parentId, index: key }),
							"==",
							luau.nil(),
						),
					),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, { left: key, operator: "=", right: luau.nil() }),
					),
					elseBody: luau.list.make(),
				}),
			);
		}
		prereqs.push(advance());
		if (consumed) {
			// restarting must not return prefix elements that were already consumed
			prereqs.push(
				luau.create(luau.SyntaxKind.WhileStatement, {
					condition: luau.binary(
						luau.binary(key, "~=", luau.nil()),
						"and",
						luau.create(luau.SyntaxKind.ComputedIndexExpression, { expression: consumed, index: key }),
					),
					statements: luau.list.make(advance()),
				}),
			);
		}
		return { value: member ? luau.array([key, member]) : key, done: luau.binary(key, "==", luau.nil()) };
	}, map);

	return {
		read(prereqs, index, omitted) {
			const value = accessor.read(prereqs, index, omitted);
			if (index === elementCount - 1) {
				return value;
			}

			consumed ??= prereqs.pushToVar(luau.array(), "consumed");
			prereqs.push(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.binary(key, "~=", luau.nil()),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: consumed,
								index: key,
							}),
							operator: "=",
							right: luau.bool(true),
						}),
					),
					elseBody: luau.list.make(),
				}),
			);
			return value;
		},
		rest: accessor.rest,
	};
}

export function createArrayBindingAccessor(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.ArrayBindingPattern | ts.ArrayLiteralExpression,
	type: ts.Type,
	parentId: luau.AnyIdentifier,
): BindingAccessor {
	if (isDefinitelyType(type, isArrayType(state))) {
		return {
			read: (prereqs, index) =>
				luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: parentId,
					index: luau.number(index + 1),
				}),
			rest: (prereqs, index) =>
				luau.call(luau.globals.table.move, [
					parentId,
					luau.number(index + 1),
					luau.unary("#", parentId),
					luau.number(1),
					luau.array(),
				]),
		};
	}

	if (isDefinitelyType(type, isStringType)) {
		const matcher = prereqs.pushToVar(
			luau.call(luau.globals.string.gmatch, [parentId, luau.globals.utf8.charpattern]),
			"matcher",
		);
		return {
			read(prereqs, index, omitted) {
				const value = luau.call(matcher);
				if (omitted) {
					prereqs.push(luau.create(luau.SyntaxKind.CallStatement, { expression: value }));
					return luau.none();
				}
				return value;
			},
			rest(prereqs) {
				const rest = prereqs.pushToVar(luau.array(), "rest");
				const char = luau.tempId("char");
				prereqs.push(
					luau.create(luau.SyntaxKind.ForStatement, {
						ids: luau.list.make(char),
						expression: matcher,
						statements: luau.list.make(
							luau.create(luau.SyntaxKind.CallStatement, {
								expression: luau.call(luau.globals.table.insert, [rest, char]),
							}),
						),
					}),
				);
				return rest;
			},
		};
	}

	if (isDefinitelyType(type, isSetType(state)) || isDefinitelyType(type, isMapType(state))) {
		return createCollectionAccessor(
			prereqs,
			parentId,
			isDefinitelyType(type, isMapType(state)),
			node.elements.length,
		);
	}

	if (isDefinitelyType(type, isSharedTableType(state))) {
		// SharedTable supports generalized iteration, but not next()
		const source = prereqs.pushToVar(parentId, "iterable");
		const key = luau.tempId("key");
		const value = luau.tempId("value");
		const iterator = prereqs.pushToVar(
			luau.call(luau.property(luau.id("coroutine"), "wrap"), [
				luau.create(luau.SyntaxKind.FunctionExpression, {
					parameters: luau.list.make(),
					hasDotDotDot: false,
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.ForStatement, {
							ids: luau.list.make(key, value),
							expression: source,
							statements: luau.list.make(
								luau.create(luau.SyntaxKind.CallStatement, {
									expression: luau.call(luau.globals.coroutine.yield, [key, value]),
								}),
							),
						}),
					),
				}),
			]),
			"iterator",
		);
		return createFunctionAccessor(iterator, true);
	}

	if (isDefinitelyType(type, isIterableFunctionType(state))) {
		return createFunctionAccessor(parentId, isDefinitelyType(type, isIterableFunctionLuaTupleType(state)));
	}

	if (
		isDefinitelyType(type, type => {
			const next = state.typeChecker.getTypeOfPropertyOfType(type, "next");
			return next !== undefined && next.getCallSignatures().length > 0;
		})
	) {
		const next = prereqs.pushToVar(luau.property(parentId, "next"), "next");
		return createIteratorAccessor(prereqs => {
			const result = prereqs.pushToVar(luau.call(next), "result");
			const done = luau.property(result, "done");
			return { value: luau.property(result, "value"), done };
		}, true);
	}

	if (isDefinitelyType(type, isIterableType(state))) {
		DiagnosticService.addDiagnostic(errors.noIterableIteration(node));
		return { read: () => luau.none(), rest: () => luau.none() };
	}

	DiagnosticService.addDiagnostic(errors.noUnsupportedIteration(node));
	return { read: () => luau.none(), rest: () => luau.none() };
}
