import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
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
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isMapType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";

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
	return luau.call(luau.globals.ipairs, [exp]);
});

const buildSetLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	luau.list.push(ids, transformBindingName(state, name, initializers));
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
		return luau.call(luau.globals.pairs, [exp]);
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

	return luau.call(luau.globals.pairs, [exp]);
});

const buildStringLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return luau.call(luau.globals.string.gmatch, [exp, luau.globals.utf8.charpattern]);
});

const buildIterableFunctionLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	luau.list.push(ids, transformBindingName(state, name, initializers));
	return exp;
});

const buildIterableFunctionLuaTupleLoop: LoopBuilder = (state, statements, name, exp) => {
	if (ts.isArrayBindingPattern(name)) {
		const builder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
			assert(ts.isArrayBindingPattern(name));
			transformInLineArrayBindingPattern(state, name, ids, initializers);
			return exp;
		});
		return builder(state, statements, name, exp);
	}

	const iterFuncId = state.pushToVar(exp);
	const loopStatements = luau.list.make<luau.Statement>();
	const valueId = transformBindingName(state, name, loopStatements);

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

	return luau.create(luau.SyntaxKind.WhileStatement, {
		condition: luau.bool(true),
		statements: loopStatements,
	});
};

const buildGeneratorLoop: LoopBuilder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
	const loopId = luau.tempId();
	luau.list.push(ids, loopId);

	luau.list.push(
		initializers,
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.property(loopId, "done"),
			statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
			elseBody: luau.list.make(),
		}),
	);

	luau.list.push(
		initializers,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: transformBindingName(state, name, initializers),
			right: luau.property(loopId, "value"),
		}),
	);

	return luau.property(convertToIndexableExpression(exp), "next");
});

function getLoopBuilder(state: TransformState, type: ts.Type): LoopBuilder {
	if (isDefinitelyType(type, t => isArrayType(state, t))) {
		return buildArrayLoop;
	} else if (isDefinitelyType(type, t => isSetType(state, t))) {
		return buildSetLoop;
	} else if (isDefinitelyType(type, t => isMapType(state, t))) {
		return buildMapLoop;
	} else if (isDefinitelyType(type, t => isStringType(t))) {
		return buildStringLoop;
	} else if (isDefinitelyType(type, t => isIterableFunctionLuaTupleType(state, t))) {
		return buildIterableFunctionLuaTupleLoop;
	} else if (isDefinitelyType(type, t => isIterableFunctionType(state, t))) {
		return buildIterableFunctionLoop;
	} else if (isDefinitelyType(type, t => isGeneratorType(state, t))) {
		return buildGeneratorLoop;
	} else {
		assert(false, `ForOf iteration type not implemented: ${state.typeChecker.typeToString(type)}`);
	}
}

export function transformForOfStatement(state: TransformState, node: ts.ForOfStatement) {
	assert(ts.isVariableDeclarationList(node.initializer) && node.initializer.declarations.length === 1);

	if (node.awaitModifier) {
		state.addDiagnostic(errors.noAwaitForOf(node));
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
