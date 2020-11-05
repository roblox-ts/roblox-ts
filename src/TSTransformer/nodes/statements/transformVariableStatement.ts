import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { getAncestor, isAncestorOf } from "TSTransformer/util/traversal";
import { isLuaTupleType } from "TSTransformer/util/types";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";

function checkVariableHoist(state: TransformState, node: ts.Identifier, symbol: ts.Symbol) {
	if (state.isHoisted.get(symbol) !== undefined) {
		return;
	}

	const statement = getAncestor(node, ts.isStatement);
	if (!statement) {
		return;
	}

	const caseClause = statement.parent;
	if (!ts.isCaseClause(caseClause)) {
		return;
	}
	const caseBlock = caseClause.parent;

	const isUsedOutsideOfCaseClause =
		ts.FindAllReferences.Core.eachSymbolReferenceInFile(
			node,
			state.typeChecker,
			node.getSourceFile(),
			token => {
				if (!isAncestorOf(caseClause, token)) {
					return true;
				}
			},
			caseBlock,
		) === true;

	if (isUsedOutsideOfCaseClause) {
		getOrSetDefault(state.hoistsByStatement, statement.parent, () => new Array<ts.Identifier>()).push(node);
		state.isHoisted.set(symbol, true);
	}
}

export function transformVariable(state: TransformState, identifier: ts.Identifier, right?: luau.Expression) {
	return state.capture(() => {
		validateIdentifier(state, identifier);

		const symbol = state.typeChecker.getSymbolAtLocation(identifier);
		assert(symbol);

		// export let
		if (isDefinedAsLet(state, symbol)) {
			const exportAccess = state.getModuleIdPropertyAccess(symbol);
			if (exportAccess) {
				if (right) {
					state.prereq(
						luau.create(luau.SyntaxKind.Assignment, {
							left: exportAccess,
							operator: "=",
							right,
						}),
					);
				}
				return exportAccess;
			}
		}

		let left: luau.AnyIdentifier = transformIdentifierDefined(state, identifier);

		const forStatement = getAncestor(identifier, ts.isVariableDeclarationList)?.parent;
		if (forStatement && ts.isForStatement(forStatement)) {
			const tempId = luau.tempId();
			getOrSetDefault(state.forStatementToSymbolsMap, forStatement, () => []).push(symbol);
			state.forStatementSymbolToIdMap.set(symbol, tempId);
			left = tempId;
		}

		checkVariableHoist(state, identifier, symbol);
		if (state.isHoisted.get(symbol) === true) {
			// no need to do `x = nil` if the variable is already created
			if (right) {
				state.prereq(luau.create(luau.SyntaxKind.Assignment, { left, operator: "=", right }));
			}
		} else {
			state.prereq(luau.create(luau.SyntaxKind.VariableDeclaration, { left, right }));
		}

		return left;
	});
}

function transformLuaTupleDestructure(
	state: TransformState,
	bindingPattern: ts.ArrayBindingPattern,
	value: luau.Expression,
) {
	return state.capturePrereqs(() => {
		const ids = luau.list.make<luau.AnyIdentifier>();
		const statements = state.capturePrereqs(() => {
			for (const element of bindingPattern.elements) {
				if (ts.isOmittedExpression(element)) {
					luau.list.push(ids, luau.emptyId());
				} else {
					if (element.dotDotDotToken) {
						state.addDiagnostic(errors.noSpreadDestructuring(element));
						return;
					}
					if (ts.isIdentifier(element.name)) {
						validateIdentifier(state, element.name);
						const id = transformIdentifierDefined(state, element.name);
						luau.list.push(ids, id);
						if (element.initializer) {
							state.prereq(transformInitializer(state, id, element.initializer));
						}
					} else {
						const id = luau.tempId();
						luau.list.push(ids, id);
						if (element.initializer) {
							state.prereq(transformInitializer(state, id, element.initializer));
						}
						if (ts.isArrayBindingPattern(element.name)) {
							transformArrayBindingPattern(state, element.name, id);
						} else {
							transformObjectBindingPattern(state, element.name, id);
						}
					}
				}
			}
		});
		if (luau.list.isEmpty(ids)) {
			luau.list.push(ids, luau.emptyId());
		}
		state.prereq(luau.create(luau.SyntaxKind.VariableDeclaration, { left: ids, right: value }));
		state.prereqList(statements);
	});
}

export function transformVariableDeclaration(
	state: TransformState,
	node: ts.VariableDeclaration,
): luau.List<luau.Statement> {
	// must transform right _before_ checking isHoisted, that way references inside of value can be hoisted
	const value = node.initializer ? transformExpression(state, node.initializer) : undefined;

	if (ts.isIdentifier(node.name)) {
		return transformVariable(state, node.name, value)[1];
	} else {
		// in destructuring, rhs must be executed first
		assert(node.initializer && value);
		const name = node.name;
		if (ts.isArrayBindingPattern(name)) {
			if (luau.isCall(value) && isLuaTupleType(state, state.getType(node.initializer))) {
				return transformLuaTupleDestructure(state, name, value);
			}
			const id = state.pushToVar(value);
			return state.capturePrereqs(() => transformArrayBindingPattern(state, name, id));
		} else {
			const id = state.pushToVar(value);
			return state.capturePrereqs(() => transformObjectBindingPattern(state, name, id));
		}
	}
}

function isVarDeclaration(node: ts.VariableDeclarationList) {
	return !(node.flags & ts.NodeFlags.Const) && !(node.flags & ts.NodeFlags.Let);
}

export function transformVariableDeclarationList(
	state: TransformState,
	node: ts.VariableDeclarationList,
): luau.List<luau.Statement> {
	if (isVarDeclaration(node)) {
		state.addDiagnostic(errors.noVar(node));
	}

	const statements = luau.list.make<luau.Statement>();
	for (const declaration of node.declarations) {
		luau.list.pushList(statements, transformVariableDeclaration(state, declaration));
	}

	return statements;
}

export function transformVariableStatement(
	state: TransformState,
	node: ts.VariableStatement,
): luau.List<luau.Statement> {
	return transformVariableDeclarationList(state, node.declarationList);
}
