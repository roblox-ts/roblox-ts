import * as lua from "LuaAST";
type Optimiser = (node: lua.Statement) => lua.List<lua.Statement>;
const TRANSFORMER_BY_KIND = new Map<lua.SyntaxKind, Optimiser>([
	// [lua.SyntaxKind.NumericForStatement, optimiseNumericForLoop],
]);

/**
 * Optimises a `lua.Statement` into a `lua.List<lua.Statement>`
 * @param node The `lua.Statement` to transform.
 */
function optimiseStatement(node: lua.Statement): lua.List<lua.Statement> {
	const transformer = TRANSFORMER_BY_KIND.get(node.kind);
	if (transformer) {
		return transformer(node);
	}
	return lua.list.make(node);
}

export function optimiseAST(ast: lua.List<lua.Statement>): lua.List<lua.Statement> {
	const optimised = lua.list.make<lua.Statement>();
	lua.list.forEach(ast, statement => {
		lua.list.pushList(optimised, optimiseStatement(statement));
	});
	return optimised;
}
