import luau from "@roblox-ts/luau-ast";
import { Statement } from "@roblox-ts/luau-ast/out/LuauAST/bundle";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

/** @param hasDotDotDot If true, assumes that the first statement is `local args = {...}` (as the varArgs optimization must be considered unsafe for generators) */
export function wrapStatementsAsGenerator(
	state: TransformState,
	node: ts.Node,
	statements: luau.List<luau.Statement>,
	hasDotDotDot: boolean,
) {
	const list = luau.list.make<Statement>();
	if (hasDotDotDot) {
		// Using `...` inside a nested parameterless function is not allowed, so capture them before entering the generator function
		const statement = luau.list.shift(statements)!;
		luau.list.push(list, statement);
	}
	luau.list.push(
		list,
		luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: luau.call(state.TS(node, "generator"), [
				luau.create(luau.SyntaxKind.FunctionExpression, {
					hasDotDotDot: false,
					parameters: luau.list.make(),
					statements,
				}),
			]),
		}),
	);
	return list;
}
