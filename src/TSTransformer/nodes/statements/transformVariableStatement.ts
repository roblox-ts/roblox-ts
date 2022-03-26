import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { getAncestor, isAncestorOf } from "TSTransformer/util/traversal";
import { isDefinitelyType, isLuaTupleType } from "TSTransformer/util/types";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

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

		const left: luau.AnyIdentifier = transformIdentifierDefined(state, identifier);

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
					luau.list.push(ids, luau.tempId());
				} else {
					if (element.dotDotDotToken) {
						DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
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
						const id = luau.tempId("binding");
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
			state.prereqList(wrapExpressionStatement(value));
		} else {
			state.prereq(luau.create(luau.SyntaxKind.VariableDeclaration, { left: ids, right: value }));
		}
		state.prereqList(statements);
	});
}

export function transformVariableDeclaration(
	state: TransformState,
	node: ts.VariableDeclaration,
): luau.List<luau.Statement> {
	const statements = luau.list.make<luau.Statement>();
	let value: luau.Expression | undefined;
	if (node.initializer) {
		// must transform right _before_ checking isHoisted, that way references inside of value can be hoisted
		luau.list.pushList(
			statements,
			// non-null assertion on node.initializer because inside callback
			state.capturePrereqs(() => (value = transformExpression(state, node.initializer!))),
		);
	}

	if (ts.isIdentifier(node.name)) {
		luau.list.pushList(statements, transformVariable(state, node.name, value)[1]);
	} else {
		// in destructuring, rhs must be executed first
		assert(node.initializer && value);
		const name = node.name;
		if (ts.isArrayBindingPattern(name)) {
			if (
				luau.isCall(value) &&
				isDefinitelyType(state, state.getType(node.initializer), node.initializer, isLuaTupleType(state))
			) {
				luau.list.pushList(statements, transformLuaTupleDestructure(state, name, value));
			} else {
				luau.list.pushList(
					statements,
					state.capturePrereqs(() =>
						transformArrayBindingPattern(state, name, state.pushToVar(value, "binding")),
					),
				);
			}
		} else {
			luau.list.pushList(
				statements,
				state.capturePrereqs(() =>
					transformObjectBindingPattern(state, name, state.pushToVar(value, "binding")),
				),
			);
		}
	}

	return statements;
}

export function isVarDeclaration(node: ts.VariableDeclarationList) {
	return !(node.flags & ts.NodeFlags.Const) && !(node.flags & ts.NodeFlags.Let);
}

export function transformVariableDeclarationList(
	state: TransformState,
	node: ts.VariableDeclarationList,
): luau.List<luau.Statement> {
	if (isVarDeclaration(node)) {
		DiagnosticService.addDiagnostic(errors.noVar(node));
	}

	const statements = luau.list.make<luau.Statement>();
	for (const declaration of node.declarations) {
		const [variableStatements, prereqs] = state.capture(() => transformVariableDeclaration(state, declaration));
		luau.list.pushList(statements, prereqs);
		luau.list.pushList(statements, variableStatements);
	}

	return statements;
}

export function transformVariableStatement(
	state: TransformState,
	node: ts.VariableStatement,
): luau.List<luau.Statement> {
	return transformVariableDeclarationList(state, node.declarationList);
}
