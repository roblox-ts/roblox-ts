import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { TransformState } from "TSTransformer/TransformState";

export function transformEnumDeclaration(state: TransformState, node: ts.EnumDeclaration) {
	if (node.modifiers?.find(modifier => modifier.kind === ts.SyntaxKind.ConstKeyword)) {
		return lua.list.make<lua.Statement>();
	}

	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	if (symbol && symbol.declarations.length > 1) {
		state.addDiagnostic(diagnostics.noEnumMerging(node));
		return lua.list.make<lua.Statement>();
	}

	const id = transformIdentifierDefined(state, node.name);

	const statements = state.capturePrereqs(() => {
		const inverseId = state.pushToVar(lua.map());
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: id,
				right: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.setmetatable,
					args: lua.list.make(lua.map(), lua.map([[lua.string("__index"), inverseId]])),
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
					right: valueExp,
				}),
			);

			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: inverseId,
						index: valueExp,
					}),
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
