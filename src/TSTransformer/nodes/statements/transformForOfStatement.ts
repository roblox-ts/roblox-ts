import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { getStatements } from "TSTransformer/util/getStatements";
import {
	isArrayType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isMapType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";

const wrapFactory = (global: luau.IndexableExpression) => (expression: luau.Expression) =>
	luau.create(luau.SyntaxKind.CallExpression, {
		expression: global,
		args: luau.list.make(expression),
	});

const wrapIpairs = wrapFactory(luau.globals.ipairs);
const wrapPairs = wrapFactory(luau.globals.pairs);

type LoopBuilder = (
	state: TransformState,
	statements: luau.List<luau.Statement>,
	name: ts.BindingName,
	exp: luau.Expression,
) => luau.Statement;

function makeForLoopBuilder(
	callback: (
		state: TransformState,
		name: ts.BindingName,
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
		return luau.create(luau.SyntaxKind.ForStatement, { ids, expression, statements });
	};
}

const buildArrayLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	luau.list.push(ids, luau.emptyId());
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return wrapIpairs(exp);
});

const buildSetLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return wrapPairs(exp);
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
		} else {
			const id = transformBindingName(state, element.name, initializers);
			if (element.initializer) {
				luau.list.push(initializers, transformInitializer(state, id, element.initializer));
			}
			luau.list.push(ids, id);
		}
	}
}

const buildMapLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	if (ts.isArrayBindingPattern(name)) {
		transformInLineArrayBindingPattern(state, name, ids, initializers);
		return wrapPairs(exp);
	}

	const keyId = luau.tempId();
	const valueId = luau.tempId();
	luau.list.push(ids, keyId);
	luau.list.push(ids, valueId);
	luau.list.unshift(
		initializers,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: transformBindingName(state, name, initializers),
			right: luau.array([keyId, valueId]),
		}),
	);

	return wrapPairs(exp);
});

const buildStringLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.globals.string.gmatch,
		args: luau.list.make(exp, luau.globals.utf8.charpattern),
	});
});

const buildIterableFunctionLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return exp;
});

const buildIterableFunctionLuaTupleLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	if (!ts.isArrayBindingPattern(name)) {
		state.addDiagnostic(diagnostics.noLuaTupleIterationWithoutDestructure(name));
		return luau.emptyId();
	}
	transformInLineArrayBindingPattern(state, name, ids, initializers);
	return exp;
});

const buildGeneratorLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	const loopId = luau.tempId();
	luau.list.push(ids, loopId);

	luau.list.push(
		initializers,
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
				expression: loopId,
				name: "done",
			}),
			statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
			elseBody: luau.list.make(),
		}),
	);

	luau.list.push(
		initializers,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: transformBindingName(state, name, initializers),
			right: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
				expression: loopId,
				name: "value",
			}),
		}),
	);

	return luau.create(luau.SyntaxKind.PropertyAccessExpression, {
		expression: convertToIndexableExpression(exp),
		name: "next",
	});
});

function getLoopBuilder(state: TransformState, type: ts.Type): LoopBuilder {
	if (isArrayType(state, type)) {
		return buildArrayLoop;
	} else if (isSetType(state, type)) {
		return buildSetLoop;
	} else if (isMapType(state, type)) {
		return buildMapLoop;
	} else if (isStringType(type)) {
		return buildStringLoop;
	} else if (isIterableFunctionLuaTupleType(state, type)) {
		return buildIterableFunctionLuaTupleLoop;
	} else if (isIterableFunctionType(state, type)) {
		return buildIterableFunctionLoop;
	} else if (isGeneratorType(state, type)) {
		return buildGeneratorLoop;
	} else {
		assert(false, `ForOf iteration type not implemented: ${state.typeChecker.typeToString(type)}`);
	}
}

export function transformForOfStatement(state: TransformState, node: ts.ForOfStatement) {
	assert(ts.isVariableDeclarationList(node.initializer) && node.initializer.declarations.length === 1);

	if (node.awaitModifier) {
		state.addDiagnostic(diagnostics.noAwaitForOf(node));
	}

	const name = node.initializer.declarations[0].name;
	if (ts.isIdentifier(name)) {
		validateIdentifier(state, name);
	}

	const result = luau.list.make<luau.Statement>();

	const [exp, expPrereqs] = state.capture(() => transformExpression(state, node.expression));
	luau.list.pushList(result, expPrereqs);

	const expType = state.getType(node.expression);
	const statements = transformStatementList(state, getStatements(node.statement));

	const loopBuilder = getLoopBuilder(state, expType);
	luau.list.push(result, loopBuilder(state, statements, name, exp));

	return result;
}
