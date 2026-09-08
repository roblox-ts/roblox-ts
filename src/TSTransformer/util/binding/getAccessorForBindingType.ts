import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
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
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
	isOmitted: boolean,
) => luau.Expression;

function peek<T>(array: Array<T>): T | undefined {
	return array[array.length - 1];
}

const arrayAccessor: BindingAccessor = (state, parentId, index) => {
	return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
		expression: parentId,
		index: luau.number(index + 1),
	});
};

const stringAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	let id: luau.AnyIdentifier;
	if (idStack.length === 0) {
		id = state.pushToVar(
			luau.call(luau.globals.string.gmatch, [parentId, luau.globals.utf8.charpattern]),
			"matcher",
		);
		idStack.push(id);
	} else {
		id = idStack[0];
	}

	const callExp = luau.call(id);

	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.none();
	} else {
		return callExp;
	}
};

const setAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const args = [parentId];
	const lastId = peek(idStack);
	if (lastId) {
		args.push(lastId);
	}
	const callExp = luau.call(luau.globals.next, args);
	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.none();
	} else {
		const id = state.pushToVar(callExp, "value");
		idStack.push(id);
		return id;
	}
};

const mapAccessor: BindingAccessor = (state, parentId, index, idStack) => {
	const args = [parentId];
	const lastId = peek(idStack);
	if (lastId) {
		args.push(lastId);
	}
	const keyId = luau.tempId("k");
	const valueId = luau.tempId("v");
	const ids = luau.list.make(keyId, valueId);
	state.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: ids,
			right: luau.call(luau.globals.next, args),
		}),
	);
	idStack.push(keyId);
	return luau.create(luau.SyntaxKind.Array, { members: ids });
};

const iterableFunctionLuaTupleAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = luau.call(parentId);
	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.none();
	} else {
		return luau.array([callExp]);
	}
};

const iterableFunctionAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = luau.call(parentId);
	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.none();
	} else {
		return callExp;
	}
};

const iterAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = luau.call(luau.property(parentId, "next"));
	if (isOmitted) {
		state.prereq(luau.create(luau.SyntaxKind.CallStatement, { expression: callExp }));
		return luau.none();
	} else {
		return luau.property(callExp, "value");
	}
};

export function getAccessorForBindingType(state: TransformState, node: ts.Node, type: ts.Type): BindingAccessor {
	if (isDefinitelyType(type, isArrayType(state))) {
		return arrayAccessor;
	} else if (isDefinitelyType(type, isStringType)) {
		return stringAccessor;
	} else if (isDefinitelyType(type, isSetType(state))) {
		return setAccessor;
	} else if (isDefinitelyType(type, isMapType(state)) || isDefinitelyType(type, isSharedTableType(state))) {
		return mapAccessor;
	} else if (isDefinitelyType(type, isIterableFunctionLuaTupleType(state))) {
		return iterableFunctionLuaTupleAccessor;
	} else if (isDefinitelyType(type, isIterableFunctionType(state))) {
		return iterableFunctionAccessor;
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
