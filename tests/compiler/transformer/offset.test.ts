import luau, { renderAST } from "@roblox-ts/luau-ast";
import { offset } from "TSTransformer/util/offset";

it("preserves expression identity when no index adjustment is needed", () => {
	const expression = luau.call(luau.id("index"));

	expect(offset(expression, 0)).toBe(expression);
	const statement = luau.create(luau.SyntaxKind.ReturnStatement, { expression: offset(expression, 0) });
	expect(renderAST(luau.list.make(statement))).toBe("return index()\n");
});

it("preserves a dynamic right operand when adjusting an index", () => {
	const expression = luau.binary(luau.id("start"), "+", luau.id("delta"));
	const statement = luau.create(luau.SyntaxKind.ReturnStatement, { expression: offset(expression, 1) });

	expect(renderAST(luau.list.make(statement))).toBe("return start + delta + 1\n");
});
