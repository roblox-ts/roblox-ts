import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getStatements } from "TSTransformer/util/getStatements";
import { isArrayType, isMapType, isSetType, isStringType } from "TSTransformer/util/types";

const wrapFactory = (global: lua.IndexableExpression) => (expression: lua.Expression) =>
	lua.create(lua.SyntaxKind.CallExpression, {
		expression: global,
		args: lua.list.make(expression),
	});

const wrapIpairs = wrapFactory(lua.globals.ipairs);
const wrapPairs = wrapFactory(lua.globals.pairs);

function getArrayLoopStructure(
	state: TransformState,
	ids: lua.List<lua.AnyIdentifier>,
	initializers: lua.List<lua.Statement>,
	name: ts.BindingName,
	innerExp: lua.Expression,
) {
	lua.list.push(ids, lua.emptyId());
	lua.list.push(ids, transformBindingName(state, name, initializers));
	return wrapIpairs(innerExp);
}

function getSetLoopStructure(
	state: TransformState,
	ids: lua.List<lua.AnyIdentifier>,
	initializers: lua.List<lua.Statement>,
	name: ts.BindingName,
	innerExp: lua.Expression,
) {
	lua.list.push(ids, transformBindingName(state, name, initializers));
	return wrapPairs(innerExp);
}

function getMapLoopStructure(
	state: TransformState,
	ids: lua.List<lua.AnyIdentifier>,
	initializers: lua.List<lua.Statement>,
	name: ts.BindingName,
	innerExp: lua.Expression,
) {
	// optimized
	if (ts.isArrayBindingPattern(name)) {
		// 0, 1, and 2 are possible, but not more than that?
		assert(name.elements.length <= 2);

		const firstElement = name.elements[0];
		if (firstElement === undefined || ts.isOmittedExpression(firstElement)) {
			lua.list.push(ids, lua.emptyId());
		} else {
			const id = transformBindingName(state, firstElement.name, initializers);
			lua.list.push(ids, id);
			if (firstElement.initializer) {
				lua.list.push(initializers, transformInitializer(state, id, firstElement.initializer));
			}
		}

		const secondElement = name.elements[1];
		if (secondElement !== undefined && !ts.isOmittedExpression(secondElement)) {
			const id = transformBindingName(state, secondElement.name, initializers);
			lua.list.push(ids, id);
			if (secondElement.initializer) {
				lua.list.push(initializers, transformInitializer(state, id, secondElement.initializer));
			}
		}

		return wrapPairs(innerExp);
	}

	const keyId = lua.tempId();
	const valueId = lua.tempId();
	lua.list.push(ids, keyId);
	lua.list.push(ids, valueId);

	const id = transformBindingName(state, name, initializers);
	lua.list.unshift(
		initializers,
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: id,
			right: lua.array([keyId, valueId]),
		}),
	);

	return wrapPairs(innerExp);
}

function getStringLoopStructure(
	state: TransformState,
	ids: lua.List<lua.AnyIdentifier>,
	initializers: lua.List<lua.Statement>,
	name: ts.BindingName,
	innerExp: lua.Expression,
) {
	lua.list.push(ids, transformBindingName(state, name, initializers));
	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.globals.string.gmatch,
		args: lua.list.make(innerExp, lua.globals.utf8.charpattern),
	});
}

function getLoopStructure(state: TransformState, name: ts.BindingName, innerExp: lua.Expression, expType: ts.Type) {
	const ids = lua.list.make<lua.AnyIdentifier>();
	const initializers = lua.list.make<lua.Statement>();
	let expression: lua.Expression;
	if (isArrayType(state, expType)) {
		expression = getArrayLoopStructure(state, ids, initializers, name, innerExp);
	} else if (isSetType(state, expType)) {
		expression = getSetLoopStructure(state, ids, initializers, name, innerExp);
	} else if (isMapType(state, expType)) {
		expression = getMapLoopStructure(state, ids, initializers, name, innerExp);
	} else if (isStringType(expType)) {
		expression = getStringLoopStructure(state, ids, initializers, name, innerExp);
	} else {
		assert(false);
	}
	return { ids, expression, initializers };
}

export function transformForOfStatement(state: TransformState, node: ts.ForOfStatement) {
	assert(ts.isVariableDeclarationList(node.initializer) && node.initializer.declarations.length === 1);
	assert(!node.awaitModifier);

	const name = node.initializer.declarations[0].name;

	const result = lua.list.make<lua.Statement>();

	const { expression: innerExp, statements: innerExpPrereqs } = state.capture(() =>
		transformExpression(state, node.expression),
	);
	lua.list.pushList(result, innerExpPrereqs);

	const expType = state.getType(node.expression);

	const statements = transformStatementList(state, getStatements(node.statement));
	const { ids, expression, initializers } = getLoopStructure(state, name, innerExp, expType);
	lua.list.unshiftList(statements, initializers);

	lua.list.push(result, lua.create(lua.SyntaxKind.ForStatement, { ids, expression, statements }));

	return result;
}
