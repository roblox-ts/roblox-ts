import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { adoptsNullableLuaTupleReturn } from "TSTransformer/util/adoptsNullableLuaTupleReturn";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isReturnBlockedByTryStatement } from "TSTransformer/util/isBlockedByTryStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol, isLuaTupleType, isNullableLuaTupleType } from "TSTransformer/util/types";
import ts from "typescript";

function returnsNullableLuaTuple(state: TransformState, node: ts.Expression) {
	// start above the returned expression, which can itself be a function in a concise arrow body
	const declaration = ts.findAncestor(node.parent, ts.isFunctionLikeDeclaration);
	assert(declaration);
	const signature = state.typeChecker.getSignatureFromDeclaration(declaration);
	assert(signature);
	const returnType = state.typeChecker.getReturnTypeOfSignature(signature);
	const nullableTuple = isNullableLuaTupleType(state)(returnType);
	if (
		nullableTuple &&
		declaration.name &&
		state
			.getType(declaration.name)
			.getCallSignatures()
			.some(overload => isLuaTupleType(state)(state.typeChecker.getReturnTypeOfSignature(overload)))
	) {
		DiagnosticService.addDiagnosticWithCache(
			declaration,
			errors.noLuaTupleReturnWidening(declaration),
			state.multiTransformState.isReportedByNoLuaTupleReturnWidening,
		);
	}
	return nullableTuple || adoptsNullableLuaTupleReturn(state, declaration);
}

function isTupleReturningCall(state: TransformState, tsExpression: ts.Expression, luaExpression: luau.Expression) {
	// intentionally NOT using state.getType() here, because that uses skipUpwards
	return (
		luau.isCall(luaExpression) &&
		isLuaTupleType(state)(state.typeChecker.getTypeAtLocation(skipDownwards(tsExpression)))
	);
}

function isTupleMacro(state: TransformState, expression: ts.CallExpression) {
	const symbol = getFirstDefinedSymbol(state, state.getType(expression.expression));
	if (symbol && symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.$tuple)) {
		return true;
	}
	return false;
}

export function transformReturnStatementInner(
	state: TransformState,
	returnExp: ts.Expression,
): luau.List<luau.Statement> {
	const result = luau.list.make<luau.Statement>();
	const prereqs = new Prereqs();

	let expression: luau.Expression | luau.List<luau.Expression>;

	const innerReturnExp = skipDownwards(returnExp);
	const nullableTuple = returnsNullableLuaTuple(state, returnExp);
	if (ts.isCallExpression(innerReturnExp) && isTupleMacro(state, innerReturnExp)) {
		const args = ensureTransformOrder(state, prereqs, innerReturnExp.arguments);
		expression = nullableTuple ? luau.array(args) : luau.list.make(...args);
	} else {
		expression = transformExpression(state, prereqs, innerReturnExp);
		if (nullableTuple) {
			// nullable tuple signatures return one table or nil, including nonnullable tuple branches
			if (isTupleReturningCall(state, returnExp, expression)) {
				expression = luau.array([expression]);
			}
		} else if (
			isLuaTupleType(state)(state.getType(returnExp)) &&
			!isTupleReturningCall(state, returnExp, expression)
		) {
			if (luau.isArray(expression)) {
				expression = expression.members;
			} else {
				expression = luau.call(luau.globals.unpack, [expression]);
			}
		}
	}

	luau.list.pushList(result, prereqs.statements);

	if (isReturnBlockedByTryStatement(returnExp)) {
		state.markTryUses("usesReturn");
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.ReturnStatement, {
				expression: luau.list.make<luau.Expression>(
					state.TS(returnExp, "TRY_RETURN"),
					luau.create(luau.SyntaxKind.Array, {
						members: luau.list.isList(expression) ? expression : luau.list.make(expression),
					}),
				),
			}),
		);
	} else {
		luau.list.push(result, luau.create(luau.SyntaxKind.ReturnStatement, { expression }));
	}

	return result;
}

export function transformReturnStatement(state: TransformState, node: ts.ReturnStatement) {
	if (!node.expression) {
		if (isReturnBlockedByTryStatement(node)) {
			state.markTryUses("usesReturn");
			return luau.list.make(
				luau.create(luau.SyntaxKind.ReturnStatement, {
					expression: luau.list.make<luau.Expression>(state.TS(node, "TRY_RETURN"), luau.array()),
				}),
			);
		}
		return luau.list.make(luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.nil() }));
	}
	return transformReturnStatementInner(state, node.expression);
}
