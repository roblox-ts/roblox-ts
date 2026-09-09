import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import luau, { renderAST } from "@roblox-ts/luau-ast";
import { renderASTWithSourceMap } from "Project/functions/renderASTWithSourceMap";
import { SourcePosition } from "Shared/types";

const emptyEndPositions = new WeakMap<luau.Node, SourcePosition>();

function findGeneratedLine(code: string, marker: string): number {
	const line = code.split("\n").findIndex(outputLine => outputLine.includes(marker)) + 1;
	expect(line).toBeGreaterThan(0);
	return line;
}

it("maps both field forms in a mixed table", () => {
	const arrayBody = luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(luau.id("print"), [luau.string("array field")]),
	});
	const mapBody = luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(luau.id("print"), [luau.string("map field")]),
	});
	const callback = (body: luau.Statement) =>
		luau.create(luau.SyntaxKind.FunctionExpression, {
			statements: luau.list.make(body),
			parameters: luau.list.make(),
			hasDotDotDot: false,
		});
	const declaration = luau.create(luau.SyntaxKind.VariableDeclaration, {
		left: luau.id("mixed"),
		right: luau.mixedTable([callback(arrayBody), [luau.string("named"), callback(mapBody)]]),
	});
	const ast = luau.list.make<luau.Statement>(declaration);
	const positions = new WeakMap<luau.Node, SourcePosition>();
	positions.set(declaration, { line: 0, column: 0 });
	positions.set(arrayBody, { line: 10, column: 2 });
	positions.set(mapBody, { line: 20, column: 3 });

	const result = renderASTWithSourceMap(ast, positions, emptyEndPositions, "input.ts", "output.luau");
	const map = new TraceMap(result.map);

	expect(result.code).toBe(renderAST(ast));
	expect(result.map.sourcesContent).toEqual([null]);
	expect(
		originalPositionFor(map, { line: findGeneratedLine(result.code, 'print("array field")'), column: 0 }),
	).toMatchObject({ line: 11, column: 2 });
	expect(
		originalPositionFor(map, { line: findGeneratedLine(result.code, 'print("map field")'), column: 0 }),
	).toMatchObject({ line: 21, column: 3 });
});

it("maps an explicitly positioned elseif header", () => {
	const thenStatement = luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(luau.id("print"), [luau.string("then")]),
	});
	const elseifStatement = luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(luau.id("print"), [luau.string("elseif")]),
	});
	const elseifNode = luau.create(luau.SyntaxKind.IfStatement, {
		condition: luau.bool(false),
		statements: luau.list.make<luau.Statement>(elseifStatement),
		elseBody: luau.list.make<luau.Statement>(),
	});
	const ifStatement = luau.create(luau.SyntaxKind.IfStatement, {
		condition: luau.bool(true),
		statements: luau.list.make<luau.Statement>(thenStatement),
		elseBody: elseifNode,
	});
	const ast = luau.list.make<luau.Statement>(ifStatement);
	const positions = new WeakMap<luau.Node, SourcePosition>();
	positions.set(ifStatement, { line: 0, column: 0 });
	positions.set(thenStatement, { line: 1, column: 1 });
	positions.set(elseifNode, { line: 6, column: 2 });
	positions.set(elseifStatement, { line: 7, column: 3 });

	const result = renderASTWithSourceMap(ast, positions, emptyEndPositions, "input.ts", "output.luau", "source");
	const map = new TraceMap(result.map);
	const elseifLine = findGeneratedLine(result.code, "elseif false then");

	expect(result.code).toBe(renderAST(ast));
	expect(originalPositionFor(map, { line: elseifLine, column: 0 })).toMatchObject({ line: 7, column: 2 });
	expect(originalPositionFor(map, { line: elseifLine + 1, column: 0 })).toMatchObject({ line: 8, column: 3 });
});

it("renders comments after a final statement and stops before unreachable code", () => {
	const finalStatement = luau.create(luau.SyntaxKind.ReturnStatement, { expression: luau.number(1) });
	const comment = luau.comment(" retained after return");
	const unreachable = luau.create(luau.SyntaxKind.VariableDeclaration, {
		left: luau.id("unreachable"),
		right: luau.bool(true),
	});
	const ast = luau.list.make<luau.Statement>(finalStatement, comment, unreachable);
	const positions = new WeakMap<luau.Node, SourcePosition>();
	positions.set(finalStatement, { line: 0, column: 0 });
	positions.set(unreachable, { line: 1, column: 0 });

	const result = renderASTWithSourceMap(ast, positions, emptyEndPositions, "input.ts", "output.luau");

	expect(result.code).toBe(renderAST(luau.list.make<luau.Statement>(finalStatement, comment)));
	expect(result.code).toContain("return 1");
	expect(result.code).toContain("-- retained after return");
	expect(result.code).not.toContain("unreachable");
});
