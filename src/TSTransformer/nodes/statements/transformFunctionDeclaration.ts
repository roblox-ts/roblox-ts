import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformParameters } from "TSTransformer/nodes/transformParameters";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { wrapStatementsAsGenerator } from "TSTransformer/util/wrapStatementsAsGenerator";

export function transformFunctionDeclaration(state: TransformState, node: ts.FunctionDeclaration) {
	if (!node.body) {
		return luau.list.make<luau.Statement>();
	}

	const isExportDefault = !!(node.modifierFlagsCache & ts.ModifierFlags.ExportDefault);

	assert(node.name || isExportDefault);

	const name = node.name ? transformIdentifierDefined(state, node.name) : luau.id("default");

	// eslint-disable-next-line prefer-const
	let { statements, parameters, hasDotDotDot } = transformParameters(state, node);
	luau.list.pushList(statements, transformStatementList(state, node.body.statements));

	let localize = isExportDefault;
	if (node.name) {
		const symbol = state.typeChecker.getSymbolAtLocation(node.name);
		assert(symbol);
		localize = state.isHoisted.get(symbol) !== true;
	}

	if (node.asteriskToken) {
		statements = wrapStatementsAsGenerator(state, statements);
	}

	if (!!(node.modifierFlagsCache & ts.ModifierFlags.Async)) {
		const right = luau.create(luau.SyntaxKind.CallExpression, {
			expression: state.TS("async"),
			args: luau.list.make(
				luau.create(luau.SyntaxKind.FunctionExpression, {
					hasDotDotDot,
					parameters,
					statements,
				}),
			),
		});
		if (localize) {
			return luau.list.make(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: name,
					right,
				}),
			);
		} else {
			return luau.list.make(
				luau.create(luau.SyntaxKind.Assignment, {
					left: name,
					operator: "=",
					right,
				}),
			);
		}
	} else {
		return luau.list.make(
			luau.create(luau.SyntaxKind.FunctionDeclaration, { localize, name, statements, parameters, hasDotDotDot }),
		);
	}
}
