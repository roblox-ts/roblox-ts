import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { getFlags } from "TSTransformer/util/getFlags";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

describe("debug rendering", () => {
	it("renders an expression without a compilation context", () => {
		const { debugRender } = TransformState.prototype;

		expect(debugRender(luau.binary(luau.number(1), "+", luau.number(2)))).toBe("1 + 2");
	});

	it("resolves temporary names in a statement list", () => {
		const { debugRenderList } = TransformState.prototype;
		const temporary = luau.tempId("value");
		const statements = luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.VariableDeclaration, { left: temporary, right: luau.number(1) }),
			luau.create(luau.SyntaxKind.ReturnStatement, { expression: temporary }),
		);

		expect(debugRenderList(statements)).toBe("local _value = 1\nreturn _value\n");
		expect(debugRenderList(statements)).toBe("local _value = 1\nreturn _value\n");
	});
});

describe("syntax kind names", () => {
	it.each([
		"EqualsToken",
		"PlusEqualsToken",
		"WithKeyword",
		"BreakKeyword",
		"ImplementsKeyword",
		"YieldKeyword",
		"TypePredicate",
		"ImportType",
		"OpenBraceToken",
		"Unknown",
		"SingleLineCommentTrivia",
		"ConflictMarkerTrivia",
		"NumericLiteral",
		"NoSubstitutionTemplateLiteral",
		"TemplateTail",
		"LessThanToken",
		"CaretEqualsToken",
		"VariableStatement",
		"DebuggerStatement",
		"QualifiedName",
		"JSDocTypeExpression",
		"JSDocTag",
		"JSDocImportTag",
		"AbstractKeyword",
		"DeferKeyword",
		"JSDocPropertyTag",
		"OfKeyword",
		"Identifier",
	] as const)("names %s without exposing enum range aliases", name => {
		expect(getKindName(ts.SyntaxKind[name])).toBe(name);
	});
});

describe("debugging flags", () => {
	enum Flags {
		None = 0,
		Read = 1,
		Write = 2,
		Execute = 4,
		ReadWrite = Read | Write,
	}

	it("reports intersecting flag names without numeric reverse mappings", () => {
		expect(getFlags(Flags.Read | Flags.Execute, Flags)).toEqual(["Read", "Execute", "ReadWrite"]);
	});

	it("does not report unset or unknown flags", () => {
		expect(getFlags(Flags.None, Flags)).toEqual([]);
		expect(getFlags(8, Flags)).toEqual([]);
	});
});
