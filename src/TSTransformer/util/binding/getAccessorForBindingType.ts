import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { getMatcherForStringAccessor } from "TSTransformer/util/binding/getMatcherForStringAccessor";
import {
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isIterableType,
	isMapType,
	isObjectType,
	isSetType,
	isSharedTableType,
	isStringType,
} from "TSTransformer/util/types";
import ts from "typescript";

type BindingAccessor = (
	prereqs: Prereqs,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
	isOmitted: boolean,
) => luau.Expression;

function peek<T>(array: Array<T>): T | undefined {
	return array[array.length - 1];
}

const arrayAccessor: BindingAccessor = (prereqs, parentId, index) => {
	return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
		expression: parentId,
		index: luau.number(index + 1),
	});
};

const stringAccessor: BindingAccessor = (prereqs, parentId, index, idStack, isOmitted) => {
	const id = getMatcherForStringAccessor(prereqs, parentId, idStack);
	const callExp = luau.call(id);

	if (isOmitted) {
		prereqs.push(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.none();
	} else {
		return callExp;
	}
};

const setAccessor: BindingAccessor = (prereqs, parentId, index, idStack, isOmitted) => {
	const args = [parentId];
	const lastId = peek(idStack);
	if (lastId) {
		args.push(lastId);
	}
	const callExp = luau.call(luau.globals.next, args);
	if (isOmitted) {
		prereqs.push(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.none();
	} else {
		const id = prereqs.pushToVar(callExp, "value");
		idStack.push(id);
		return id;
	}
};

const mapAccessor: BindingAccessor = (prereqs, parentId, index, idStack) => {
	const args = [parentId];
	const lastId = peek(idStack);
	if (lastId) {
		args.push(lastId);
	}
	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");
	const ids = luau.list.make(keyId, valueId);
	prereqs.push(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: ids,
			right: luau.call(luau.globals.next, args),
		}),
	);
	idStack.push(keyId);
	return luau.create(luau.SyntaxKind.Array, { members: ids });
};

const iterableFunctionLuaTupleAccessor: BindingAccessor = (prereqs, parentId, index, idStack, isOmitted) => {
	const callExp = luau.call(parentId);
	if (isOmitted) {
		prereqs.push(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.none();
	} else {
		return luau.array([callExp]);
	}
};

const iterableFunctionAccessor: BindingAccessor = (prereqs, parentId, index, idStack, isOmitted) => {
	const callExp = luau.call(parentId);
	if (isOmitted) {
		prereqs.push(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.none();
	} else {
		return callExp;
	}
};

function createExhaustibleIterableFunctionAccessor(isTuple: boolean): BindingAccessor {
	return (prereqs, parentId, index, idStack, isOmitted) => {
		const previousDoneId = idStack[0];
		const stepPrereqs = new Prereqs();
		let value: luau.Expression = luau.call(parentId);
		let valueId: luau.TemporaryIdentifier | undefined;
		if (!isOmitted) {
			valueId = luau.tempId("value");
			const right = isTuple ? luau.array([value]) : value;
			if (previousDoneId) {
				prereqs.push(luau.create(luau.SyntaxKind.VariableDeclaration, { left: valueId, right: undefined }));
				stepPrereqs.push(luau.create(luau.SyntaxKind.Assignment, { left: valueId, operator: "=", right }));
			} else {
				stepPrereqs.push(luau.create(luau.SyntaxKind.VariableDeclaration, { left: valueId, right }));
			}
			value = isTuple
				? luau.create(luau.SyntaxKind.ComputedIndexExpression, { expression: valueId, index: luau.number(1) })
				: valueId;
		}

		const isDone = luau.binary(value, "==", luau.nil());
		let doneId = previousDoneId;
		if (doneId) {
			stepPrereqs.push(luau.create(luau.SyntaxKind.Assignment, { left: doneId, operator: "=", right: isDone }));
		} else {
			doneId = stepPrereqs.pushToVar(isDone, "done");
			// the rest collector shares this state with named and omitted prefix elements
			idStack.push(doneId);
		}

		if (isTuple && valueId) {
			// trailing returns do not produce a tuple after the first return ends iteration
			stepPrereqs.push(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: doneId,
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, { left: valueId, operator: "=", right: luau.nil() }),
					),
					elseBody: luau.list.make(),
				}),
			);
		}

		if (previousDoneId) {
			prereqs.push(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.unary("not", previousDoneId),
					statements: stepPrereqs.statements,
					elseBody: luau.list.make(),
				}),
			);
		} else {
			prereqs.pushList(stepPrereqs.statements);
		}
		return valueId ?? luau.none();
	};
}

const iterAccessor: BindingAccessor = (prereqs, parentId, index, idStack, isOmitted) => {
	const callExp = luau.call(luau.property(parentId, "next"));
	if (isOmitted) {
		prereqs.push(luau.create(luau.SyntaxKind.CallStatement, { expression: callExp }));
		return luau.none();
	} else {
		return luau.property(callExp, "value");
	}
};

export function getAccessorForBindingType(
	state: TransformState,
	node: ts.Node,
	type: ts.Type,
	hasRest: boolean,
): BindingAccessor {
	if (isDefinitelyType(type, isArrayType(state))) {
		return arrayAccessor;
	} else if (isDefinitelyType(type, isStringType)) {
		return stringAccessor;
	} else if (isDefinitelyType(type, isSetType(state))) {
		return setAccessor;
	} else if (isDefinitelyType(type, isMapType(state)) || isDefinitelyType(type, isSharedTableType(state))) {
		return mapAccessor;
	} else if (isDefinitelyType(type, isIterableFunctionLuaTupleType(state))) {
		return hasRest ? createExhaustibleIterableFunctionAccessor(true) : iterableFunctionLuaTupleAccessor;
	} else if (isDefinitelyType(type, isIterableFunctionType(state))) {
		return hasRest ? createExhaustibleIterableFunctionAccessor(false) : iterableFunctionAccessor;
	} else if (isDefinitelyType(type, isIterableType(state))) {
		DiagnosticService.addDiagnostic(errors.noIterableIteration(node));
		return () => luau.none();
	} else if (
		isDefinitelyType(type, isGeneratorType(state)) ||
		isDefinitelyType(type, isObjectType) ||
		ts.isThis(node)
	) {
		return iterAccessor;
	}
	assert(false, `Destructuring not supported for type: ${state.typeChecker.typeToString(type)}`);
}
