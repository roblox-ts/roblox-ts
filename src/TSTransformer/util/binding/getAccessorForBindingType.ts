import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import {
	getTypeArguments,
	isArrayType,
	isDoubleDecrementedIterableFunctionType,
	isFirstDecrementedIterableFunctionType,
	isGeneratorType,
	isIterableFunctionType,
	isLuaTupleType,
	isMapType,
	isObjectType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";

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

const arrayAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	return lua.create(lua.SyntaxKind.ComputedIndexExpression, {
		expression: parentId,
		index: lua.number(index + 1),
	});
};

const stringAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	let id: lua.AnyIdentifier;
	if (idStack.length === 0) {
		id = state.pushToVar(
			lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.string.gmatch,
				args: lua.list.make<lua.Expression>(parentId, lua.globals.utf8.charpattern),
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

	if (isOmitted) {
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

const setAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const args = lua.list.make<lua.Expression>(parentId);
	const lastId = peek(idStack);
	if (lastId) {
		lua.list.push(args, lastId);
	}
	const callExp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.next,
		args,
	});
	if (isOmitted) {
		state.prereq(
			lua.create(lua.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return lua.emptyId();
	} else {
		const id = state.pushToVar(callExp);
		idStack.push(id);
		return id;
	}
};

const mapAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
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

const iterableFunctionTupleAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: parentId,
		args: lua.list.make(),
	});
	if (isOmitted) {
		state.prereq(
			lua.create(lua.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return lua.emptyId();
	} else {
		return lua.array([callExp]);
	}
};

const iterableFunctionAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: parentId,
		args: lua.list.make(),
	});
	if (isOmitted) {
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

const firstDecrementedIterableAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: parentId,
		args: lua.list.make(),
	});
	if (isOmitted) {
		state.prereq(
			lua.create(lua.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return lua.emptyId();
	} else {
		const id1 = lua.tempId();
		const id2 = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: lua.list.make(id1, id2),
				right: callExp,
			}),
		);
		return lua.array([
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: id1,
				operator: "and",
				right: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: id1,
					operator: "-",
					right: lua.number(1),
				}),
			}),
			id2,
		]);
	}
};

const doubleDecrementedIteratorAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: parentId,
		args: lua.list.make(),
	});
	if (isOmitted) {
		state.prereq(
			lua.create(lua.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return lua.emptyId();
	} else {
		const id1 = lua.tempId();
		const id2 = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: lua.list.make(id1, id2),
				right: callExp,
			}),
		);
		return lua.array([
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: id1,
				operator: "and",
				right: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: id1,
					operator: "-",
					right: lua.number(1),
				}),
			}),
			lua.create(lua.SyntaxKind.BinaryExpression, {
				left: id2,
				operator: "and",
				right: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: id2,
					operator: "-",
					right: lua.number(1),
				}),
			}),
		]);
	}
};

const iterAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: parentId,
			name: "next",
		}),
		args: lua.list.make(),
	});
	if (isOmitted) {
		state.prereq(
			lua.create(lua.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return lua.emptyId();
	} else {
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: callExp,
			name: "value",
		});
	}
};

export function getAccessorForBindingType(
	state: TransformState,
	node: ts.Node,
	type: ts.Type | ReadonlyArray<ts.Type>,
): BindingAccessor {
	if (ts.isArray(type) || isArrayType(state, type)) {
		return arrayAccessor;
	} else if (isStringType(state, type)) {
		return stringAccessor;
	} else if (isSetType(state, type)) {
		return setAccessor;
	} else if (isMapType(state, type)) {
		return mapAccessor;
	} else if (isIterableFunctionType(state, type)) {
		return isLuaTupleType(state, getTypeArguments(state, type)[0])
			? iterableFunctionTupleAccessor
			: iterableFunctionAccessor;
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
