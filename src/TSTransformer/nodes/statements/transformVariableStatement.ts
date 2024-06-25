import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { arrayBindingPatternContainsHoists } from "TSTransformer/util/arrayBindingPatternContainsHoists";
import { checkVariableHoist } from "TSTransformer/util/checkVariableHoist";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { isLuaTupleType } from "TSTransformer/util/types";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import { wrapExpressionStatement } from "TSTransformer/util/wrapExpressionStatement";
import ts from "typescript";

export function transformVariable(
	state: TransformState,
	prereqs: Prereqs,
	identifier: ts.Identifier,
	right?: luau.Expression,
) {
	validateIdentifier(state, identifier);

	const symbol = state.typeChecker.getSymbolAtLocation(identifier);
	assert(symbol);

	// export let
	if (isSymbolMutable(state, symbol)) {
		const exportAccess = state.getModuleIdPropertyAccess(symbol);
		if (exportAccess) {
			if (right) {
				prereqs.prereq(
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
			prereqs.prereq(luau.create(luau.SyntaxKind.Assignment, { left, operator: "=", right }));
		}
	} else {
		prereqs.prereq(luau.create(luau.SyntaxKind.VariableDeclaration, { left, right }));
	}

	return left;
}

function transformOptimizedArrayBindingPattern(
	state: TransformState,
	bindingPattern: ts.ArrayBindingPattern,
	rhs: luau.Expression | luau.List<luau.Expression>,
) {
	const outerPrereqs = new Prereqs();
	const innerPrereqs = new Prereqs();

	const ids = luau.list.make<luau.AnyIdentifier>();

	for (const element of bindingPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			luau.list.push(ids, luau.tempId());
		} else {
			if (element.dotDotDotToken) {
				DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
				continue;
			}
			if (ts.isIdentifier(element.name)) {
				validateIdentifier(state, element.name);
				const id = transformIdentifierDefined(state, element.name);
				luau.list.push(ids, id);
				if (element.initializer) {
					innerPrereqs.prereq(transformInitializer(state, id, element.initializer));
				}
			} else {
				const id = luau.tempId("binding");
				luau.list.push(ids, id);
				if (element.initializer) {
					innerPrereqs.prereq(transformInitializer(state, id, element.initializer));
				}
				if (ts.isArrayBindingPattern(element.name)) {
					transformArrayBindingPattern(state, innerPrereqs, element.name, id);
				} else {
					transformObjectBindingPattern(state, innerPrereqs, element.name, id);
				}
			}
		}
	}

	assert(!luau.list.isEmpty(ids));
	outerPrereqs.prereq(luau.create(luau.SyntaxKind.VariableDeclaration, { left: ids, right: rhs }));
	outerPrereqs.prereqList(innerPrereqs.statements);

	return outerPrereqs.statements;
}

export function transformVariableDeclaration(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.VariableDeclaration,
): luau.List<luau.Statement> {
	const statements = luau.list.make<luau.Statement>();
	let value: luau.Expression | undefined;
	if (node.initializer) {
		// must transform right _before_ checking isHoisted, that way references inside of value can be hoisted
		const initializerPrereqs = new Prereqs();
		value = transformExpression(state, initializerPrereqs, node.initializer);
		luau.list.pushList(statements, initializerPrereqs.statements);
	}

	const name = node.name;
	if (ts.isIdentifier(name)) {
		const namePrereqs = new Prereqs();
		transformVariable(state, namePrereqs, name, value);
		luau.list.pushList(statements, namePrereqs.statements);
	} else {
		// in destructuring, rhs must be executed first
		assert(node.initializer && value);

		// optimize empty destructure
		if (name.elements.length === 0) {
			if (!luau.isArray(value) || !luau.list.isEmpty(value.members)) {
				luau.list.pushList(statements, wrapExpressionStatement(value));
			}
			return statements;
		}

		if (ts.isArrayBindingPattern(name)) {
			if (
				luau.isCall(value) &&
				isLuaTupleType(state)(state.getType(node.initializer)) &&
				!arrayBindingPatternContainsHoists(state, name)
			) {
				luau.list.pushList(statements, transformOptimizedArrayBindingPattern(state, name, value));
			} else if (
				luau.isArray(value) &&
				!luau.list.isEmpty(value.members) &&
				// we can't localize multiple variables at the same time if any of them are hoisted
				!arrayBindingPatternContainsHoists(state, name)
			) {
				luau.list.pushList(statements, transformOptimizedArrayBindingPattern(state, name, value.members));
			} else {
				const prereqs = new Prereqs();
				transformArrayBindingPattern(state, prereqs, name, prereqs.pushToVar(value, "binding"));
				luau.list.pushList(statements, prereqs.statements);
			}
		} else {
			const prereqs = new Prereqs();
			transformObjectBindingPattern(state, prereqs, name, prereqs.pushToVar(value, "binding"));
			luau.list.pushList(statements, prereqs.statements);
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
		const variablePrereqs = new Prereqs();
		const variableStatements = transformVariableDeclaration(state, variablePrereqs, declaration);
		luau.list.pushList(statements, variablePrereqs.statements);
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
