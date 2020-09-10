import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getStatements } from "TSTransformer/util/getStatements";
import { isArrayType, isMapType, isSetType, isStringType } from "TSTransformer/util/types";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";

const wrapFactory = (global: luau.IndexableExpression) => (expression: luau.Expression) =>
	luau.create(luau.SyntaxKind.CallExpression, {
		expression: global,
		args: luau.list.make(expression),
	});

const wrapIpairs = wrapFactory(luau.globals.ipairs);
const wrapPairs = wrapFactory(luau.globals.pairs);

function getArrayLoopStructure(
	state: TransformState,
	ids: luau.List<luau.AnyIdentifier>,
	initializers: luau.List<luau.Statement>,
	name: ts.BindingName,
	innerExp: luau.Expression,
) {
	luau.list.push(ids, luau.emptyId());
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return wrapIpairs(innerExp);
}

function getSetLoopStructure(
	state: TransformState,
	ids: luau.List<luau.AnyIdentifier>,
	initializers: luau.List<luau.Statement>,
	name: ts.BindingName,
	innerExp: luau.Expression,
) {
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return wrapPairs(innerExp);
}

function getMapLoopStructure(
	state: TransformState,
	ids: luau.List<luau.AnyIdentifier>,
	initializers: luau.List<luau.Statement>,
	name: ts.BindingName,
	innerExp: luau.Expression,
) {
	// optimized
	if (ts.isArrayBindingPattern(name)) {
		// 0, 1, and 2 are possible, but not more than that?
		assert(name.elements.length <= 2);

		const firstElement = name.elements[0];
		if (firstElement === undefined || ts.isOmittedExpression(firstElement)) {
			luau.list.push(ids, luau.emptyId());
		} else {
			const id = transformBindingName(state, firstElement.name, initializers);
			luau.list.push(ids, id);
			if (firstElement.initializer) {
				luau.list.push(initializers, transformInitializer(state, id, firstElement.initializer));
			}
		}

		const secondElement = name.elements[1];
		if (secondElement !== undefined && !ts.isOmittedExpression(secondElement)) {
			const id = transformBindingName(state, secondElement.name, initializers);
			luau.list.push(ids, id);
			if (secondElement.initializer) {
				luau.list.push(initializers, transformInitializer(state, id, secondElement.initializer));
			}
		}

		return wrapPairs(innerExp);
	}

	const keyId = luau.tempId();
	const valueId = luau.tempId();
	luau.list.push(ids, keyId);
	luau.list.push(ids, valueId);

	const id = transformBindingName(state, name, initializers);
	luau.list.unshift(
		initializers,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: id,
			right: luau.array([keyId, valueId]),
		}),
	);

	return wrapPairs(innerExp);
}

function getStringLoopStructure(
	state: TransformState,
	ids: luau.List<luau.AnyIdentifier>,
	initializers: luau.List<luau.Statement>,
	name: ts.BindingName,
	innerExp: luau.Expression,
) {
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.string.gmatch,
		args: luau.list.make(innerExp, luau.globals.utf8.charpattern),
	});
}

function getLoopStructure(state: TransformState, name: ts.BindingName, innerExp: luau.Expression, expType: ts.Type) {
	const ids = luau.list.make<luau.AnyIdentifier>();
	const initializers = luau.list.make<luau.Statement>();
	let expression: luau.Expression;
	if (isArrayType(state, expType)) {
		expression = getArrayLoopStructure(state, ids, initializers, name, innerExp);
	} else if (isSetType(state, expType)) {
		expression = getSetLoopStructure(state, ids, initializers, name, innerExp);
	} else if (isMapType(state, expType)) {
		expression = getMapLoopStructure(state, ids, initializers, name, innerExp);
	} else if (isStringType(expType)) {
		expression = getStringLoopStructure(state, ids, initializers, name, innerExp);
	} else {
		assert(false, "Not implemented");
	}
	return { ids, expression, initializers };
}

export function transformForOfStatement(state: TransformState, node: ts.ForOfStatement) {
	assert(ts.isVariableDeclarationList(node.initializer) && node.initializer.declarations.length === 1);
	assert(!node.awaitModifier);

	const name = node.initializer.declarations[0].name;

	if (ts.isIdentifier(name)) {
		validateIdentifier(state, name);
	}

	const result = luau.list.make<luau.Statement>();

	const [innerExp, innerExpPrereqs] = state.capture(() => transformExpression(state, node.expression));
	luau.list.pushList(result, innerExpPrereqs);

	const expType = state.getType(node.expression);

	const statements = transformStatementList(state, getStatements(node.statement));
	const { ids, expression, initializers } = getLoopStructure(state, name, innerExp, expType);
	luau.list.unshiftList(statements, initializers);

	luau.list.push(result, luau.create(luau.SyntaxKind.ForStatement, { ids, expression, statements }));

	return result;
}
