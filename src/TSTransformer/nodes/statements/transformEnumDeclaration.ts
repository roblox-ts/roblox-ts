import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";

function hasMultipleDefinitions(symbol: ts.Symbol): boolean {
	let amtValueDefinitions = 0;
	for (const declaration of symbol.declarations) {
		if (ts.isEnumDeclaration(declaration) && !!(declaration.modifierFlagsCache & ts.ModifierFlags.Const)) {
			amtValueDefinitions++;
			if (amtValueDefinitions > 1) {
				return true;
			}
		}
	}
	return false;
}

export function transformEnumDeclaration(state: TransformState, node: ts.EnumDeclaration) {
	if (!!(node.modifierFlagsCache & ts.ModifierFlags.Const)) {
		return lua.list.make<lua.Statement>();
	}

	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	if (symbol && hasMultipleDefinitions(symbol)) {
		state.addDiagnostic(diagnostics.noEnumMerging(node));
		return lua.list.make<lua.Statement>();
	}

	const id = transformIdentifierDefined(state, node.name);

	const statements = state.capturePrereqs(() => {
		const inverseId = state.pushToVar(lua.map());
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: id,
				operator: "=",
				right: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.setmetatable,
					args: lua.list.make(lua.map(), lua.map([[lua.strings.__index, inverseId]])),
				}),
			}),
		);

		for (const member of node.members) {
			// TS will error otherwise
			assert(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name));

			const nameStr = member.name.text;
			const value = state.typeChecker.getConstantValue(member);

			let valueExp: lua.Expression;
			if (typeof value === "string") {
				valueExp = lua.string(value);
			} else if (typeof value === "number") {
				valueExp = lua.number(value);
			} else {
				assert(member.initializer);
				valueExp = state.pushToVarIfComplex(transformExpression(state, member.initializer));
			}

			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression: id,
						name: nameStr,
					}),
					operator: "=",
					right: valueExp,
				}),
			);

			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: inverseId,
						index: valueExp,
					}),
					operator: "=",
					right: lua.string(nameStr),
				}),
			);
		}
	});

	return lua.list.make<lua.Statement>(
		lua.create(lua.SyntaxKind.VariableDeclaration, { left: id, right: undefined }),
		lua.create(lua.SyntaxKind.DoStatement, { statements }),
	);
}
