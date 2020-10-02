import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import {
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isMapType,
	isObjectType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";

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

const arrayAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	return luau.create(luau.SyntaxKind.ComputedIndexExpression, {
		expression: parentId,
		index: luau.number(index + 1),
	});
};

const stringAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	let id: luau.AnyIdentifier;
	if (idStack.length === 0) {
		id = state.pushToVar(
			luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.string.gmatch,
				args: luau.list.make<luau.Expression>(parentId, luau.globals.utf8.charpattern),
			}),
		);
		idStack.push(id);
	} else {
		id = idStack[0];
	}

	const callExp = luau.create(luau.SyntaxKind.CallExpression, {
		expression: id,
		args: luau.list.make(),
	});

	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.emptyId();
	} else {
		return callExp;
	}
};

const setAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const args = luau.list.make<luau.Expression>(parentId);
	const lastId = peek(idStack);
	if (lastId) {
		luau.list.push(args, lastId);
	}
	const callExp = luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.next,
		args,
	});
	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.emptyId();
	} else {
		const id = state.pushToVar(callExp);
		idStack.push(id);
		return id;
	}
};

const mapAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const args = luau.list.make<luau.Expression>(parentId);
	const lastId = peek(idStack);
	if (lastId) {
		luau.list.push(args, lastId);
	}
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	const ids = luau.list.make(keyId, valueId);
	state.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: ids,
			right: luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.next,
				args,
			}),
		}),
	);
	idStack.push(keyId);
	return luau.create(luau.SyntaxKind.Array, { members: ids });
};

const iterableFunctionLuaTupleAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = luau.create(luau.SyntaxKind.CallExpression, {
		expression: parentId,
		args: luau.list.make(),
	});
	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.emptyId();
	} else {
		return luau.array([callExp]);
	}
};

const iterableFunctionAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = luau.create(luau.SyntaxKind.CallExpression, {
		expression: parentId,
		args: luau.list.make(),
	});
	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.emptyId();
	} else {
		return callExp;
	}
};

const iterAccessor: BindingAccessor = (state, parentId, index, idStack, isOmitted) => {
	const callExp = luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
			expression: parentId,
			name: "next",
		}),
		args: luau.list.make(),
	});
	if (isOmitted) {
		state.prereq(
			luau.create(luau.SyntaxKind.CallStatement, {
				expression: callExp,
			}),
		);
		return luau.emptyId();
	} else {
		return luau.create(luau.SyntaxKind.PropertyAccessExpression, {
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
	if (ts.isArray(type) || isDefinitelyType(type, t => isArrayType(state, t))) {
		return arrayAccessor;
	} else if (isDefinitelyType(type, t => isStringType(t))) {
		return stringAccessor;
	} else if (isDefinitelyType(type, t => isSetType(state, t))) {
		return setAccessor;
	} else if (isDefinitelyType(type, t => isMapType(state, t))) {
		return mapAccessor;
	} else if (isDefinitelyType(type, t => isIterableFunctionLuaTupleType(state, t))) {
		return iterableFunctionLuaTupleAccessor;
	} else if (isDefinitelyType(type, t => isIterableFunctionType(state, t))) {
		return iterableFunctionAccessor;
	} else if (
		isDefinitelyType(type, t => isGeneratorType(state, t)) ||
		isDefinitelyType(type, t => isObjectType(t)) ||
		ts.isThis(node)
	) {
		return iterAccessor;
	}
	assert(false, `Destructuring not supported for type: ${state.typeChecker.typeToString(type)}`);
}
