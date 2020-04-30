import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import {
	isArrayType,
	isSetType,
	isMapType,
	isIterableFunctionType,
	isTupleType,
	isFirstDecrementedIterableFunctionType,
	isDoubleDecrementedIterableFunctionType,
	isGeneratorType,
	isObjectType,
	isStringType,
} from "TSTransformer/util/types";
import { pushToVar } from "TSTransformer/util/pushToVar";

type BindingAccessor = (
	state: TransformState,
	parentId: lua.AnyIdentifier,
	index: number,
	idStack: Array<lua.AnyIdentifier>,
	isOmitted: boolean,
) => lua.Expression;

function peek<T>(array: Array<T>): T | undefined {
	return array[array.length - 1];
}

const arrayAccessor: BindingAccessor = (state, parentId, index, idStack, isHole) => {
	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: parentId,
		index: lua.number(index + 1),
	});
};

const stringAccessor: BindingAccessor = (state, parentId, index, idStack, isHole) => {
	let id: lua.AnyIdentifier;
	if (idStack.length === 0) {
		id = pushToVar(
			state,
			lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.string.gmatch,
				args: lua.list.make<lua.Expression>(parentId, lua.string("[%z\\1-\\127\\194-\\244][\\128-\\191]*")),
			}),
		);
		idStack.push(id);
	} else {
		id = idStack[0];
	}

	const callExp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: id,
		args: lua.list.make(),
	});

	if (isHole) {
		state.prereq(
			lua.create(lua.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return lua.emptyId();
	} else {
		return callExp;
	}
};

const setAccessor: BindingAccessor = (state, parentId, index, idStack, isHole) => {
	const args = lua.list.make<lua.Expression>(parentId);
	const lastId = peek(idStack);
	if (lastId) {
		lua.list.push(args, lastId);
	}
	const id = pushToVar(
		state,
		lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.next,
			args,
		}),
	);
	idStack.push(id);
	return id;
};

const mapAccessor: BindingAccessor = (state, parentId, index, idStack, isHole) => {
	const args = lua.list.make<lua.Expression>(parentId);
	const lastId = peek(idStack);
	if (lastId) {
		lua.list.push(args, lastId);
	}
	const keyId = lua.tempId();
	const valueId = lua.tempId();
	const ids = lua.list.make(keyId, valueId);
	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: ids,
			right: lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.next,
				args,
			}),
		}),
	);
	idStack.push(keyId);
	return lua.create(lua.SyntaxKind.Array, { members: ids });
};

// TODO
const iterableFunctionTupleAccessor: BindingAccessor = () => lua.string("iterableFunctionTupleAccessor");

const iterableFunctionAccessor: BindingAccessor = () => lua.string("iterableFunctionAccessor");

const firstDecrementedIterableAccessor: BindingAccessor = () => lua.string("firstDecrementedIterableAccessor");

const doubleDecrementedIteratorAccessor: BindingAccessor = () => lua.string("doubleDecrementedIteratorAccessor");

const iterAccessor: BindingAccessor = () => lua.string("iterAccessor");

export function getAccessorForBindingType(
	state: TransformState,
	node: ts.Node,
	type: ts.Type | Array<ts.Type>,
): BindingAccessor {
	if (Array.isArray(type) || isArrayType(state, type)) {
		return arrayAccessor;
	} else if (isStringType(state, type)) {
		return stringAccessor;
	} else if (isSetType(state, type)) {
		return setAccessor;
	} else if (isMapType(state, type)) {
		return mapAccessor;
	} else if (isIterableFunctionType(state, type)) {
		assert(type.typeArguments);
		return isTupleType(state, type.typeArguments[0]) ? iterableFunctionTupleAccessor : iterableFunctionAccessor;
	} else if (isFirstDecrementedIterableFunctionType(state, type)) {
		return firstDecrementedIterableAccessor;
	} else if (isDoubleDecrementedIterableFunctionType(state, type)) {
		return doubleDecrementedIteratorAccessor;
	} else if (isGeneratorType(state, type) || isObjectType(state, type) || ts.isThis(node)) {
		// TODO super?
		return iterAccessor;
	}
	assert(false);
}
