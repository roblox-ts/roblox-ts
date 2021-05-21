import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { getStatements } from "TSTransformer/util/getStatements";
import {
	getTypeArguments,
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isIterableType,
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
) => luau.List<luau.Statement>;

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
		return luau.list.make(luau.create(luau.SyntaxKind.ForStatement, { ids, expression, statements }));
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

	const bindingList = luau.list.make<luau.Statement>();
	luau.list.push(
		initializers,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: transformBindingName(state, name, bindingList),
			right: luau.array([keyId, valueId]),
		}),
	);
	luau.list.pushList(initializers, bindingList);

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

const buildIterableFunctionLuaTupleLoop: (type: ts.Type) => LoopBuilder = type => (state, statements, name, exp) => {
	if (ts.isArrayBindingPattern(name)) {
		const builder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
			assert(ts.isArrayBindingPattern(name));
			transformInLineArrayBindingPattern(state, name, ids, initializers);
			return exp;
		});
		return builder(state, statements, name, exp);
	}

	const iteratorReturnIds: Array<luau.TemporaryIdentifier> = [];

	const tupleId = transformBindingName(state, name, statements);

	const luaTupleType = getTypeArguments(state, type)[0];
	assert(luaTupleType.aliasTypeArguments && luaTupleType.aliasTypeArguments.length > 0, "No luaTuple type arguments");
	const tupleArgType = luaTupleType.aliasTypeArguments[0];

	if (state.typeChecker.isTupleType(tupleArgType)) {
		const tupleReturnAmount = getTypeArguments(state, tupleArgType).length;
		for (let i = 0; i < tupleReturnAmount; i++) {
			iteratorReturnIds.push(luau.tempId());
		}
	} else {
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

		return luau.list.make(
			luau.create(luau.SyntaxKind.WhileStatement, {
				condition: luau.bool(true),
				statements: loopStatements,
			}),
		);
	}

	const builder = makeForLoopBuilder((state, name, exp, ids, initializers) => {
		for (const id of iteratorReturnIds) {
			luau.list.push(ids, id);
		}

		luau.list.push(
			initializers,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: tupleId,
				right: luau.array(iteratorReturnIds),
			}),
		);
		return exp;
	});

	return builder(state, statements, name, exp);
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

	const bindingList = luau.list.make<luau.Statement>();
	luau.list.push(
		initializers,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: transformBindingName(state, name, bindingList),
			right: luau.property(loopId, "value"),
		}),
	);
	luau.list.pushList(initializers, bindingList);

	return luau.property(convertToIndexableExpression(exp), "next");
});

function getLoopBuilder(state: TransformState, node: ts.Node, type: ts.Type): LoopBuilder {
	if (isDefinitelyType(type, t => isArrayType(state, t))) {
		return buildArrayLoop;
	} else if (isDefinitelyType(type, t => isSetType(state, t))) {
		return buildSetLoop;
	} else if (isDefinitelyType(type, t => isMapType(state, t))) {
		return buildMapLoop;
	} else if (isDefinitelyType(type, t => isStringType(t))) {
		return buildStringLoop;
	} else if (isDefinitelyType(type, t => isIterableFunctionLuaTupleType(state, t))) {
		return buildIterableFunctionLuaTupleLoop(type);
	} else if (isDefinitelyType(type, t => isIterableFunctionType(state, t))) {
		return buildIterableFunctionLoop;
	} else if (isDefinitelyType(type, t => isGeneratorType(state, t))) {
		return buildGeneratorLoop;
	} else if (isDefinitelyType(type, t => isIterableType(state, t))) {
		DiagnosticService.addDiagnostic(errors.noIterableIteration(node));
		return () => luau.list.make();
	} else if (type.isUnion()) {
		DiagnosticService.addDiagnostic(errors.noMacroUnion(node));
		return () => luau.list.make();
	} else {
		assert(false, `ForOf iteration type not implemented: ${state.typeChecker.typeToString(type)}`);
	}
}

export function transformForOfStatement(state: TransformState, node: ts.ForOfStatement): luau.List<luau.Statement> {
	if (!ts.isVariableDeclarationList(node.initializer) || node.initializer.declarations.length !== 1) {
		DiagnosticService.addDiagnostic(errors.noComplexForOf(node.initializer));
		return luau.list.make();
	}

	if (node.awaitModifier) {
		DiagnosticService.addDiagnostic(errors.noAwaitForOf(node));
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

	const loopBuilder = getLoopBuilder(state, node.expression, expType);
	luau.list.pushList(result, loopBuilder(state, statements, name, exp));

	return result;
}
