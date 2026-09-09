import { originalPositionFor } from "@jridgewell/trace-mapping";
import { printSourceFileWithTraceMap } from "Project/functions/printSourceFileWithTraceMap";
import { assert } from "Shared/util/assert";
import { MultiTransformState } from "TSTransformer/classes/MultiTransformState";
import { getOriginalSourcePosition } from "TSTransformer/util/getOriginalSourcePosition";
import ts from "typescript";

function reprint(source: ts.SourceFile) {
	const printed = printSourceFileWithTraceMap(source, { sourceMap: true });
	assert(printed.traceMap);
	const proxy = ts.createSourceFile(source.fileName, printed.text, ts.ScriptTarget.Latest, true);
	const state = new MultiTransformState();
	state.reprintTraceMaps.set(source.fileName, printed.traceMap);
	return { proxy, state, traceMap: printed.traceMap };
}

it("keeps an unmapped synthetic statement at its proxy position while remapping preserved statements", () => {
	const source = ts.createSourceFile("input.ts", "\n\nconst original = 1;\n", ts.ScriptTarget.Latest, true);
	const inserted = ts.factory.createExpressionStatement(
		ts.factory.createCallExpression(ts.factory.createIdentifier("instrument"), undefined, []),
	);
	const transformed = ts.factory.updateSourceFile(source, [inserted, ...source.statements]);
	const { proxy, state, traceMap } = reprint(transformed);

	expect(originalPositionFor(traceMap, { line: 1, column: 0 })).toMatchObject({ line: null, source: null });
	expect(getOriginalSourcePosition(state, proxy.statements[0])).toEqual({ line: 0, column: 0 });
	expect(getOriginalSourcePosition(state, proxy.statements[1])).toEqual({ line: 2, column: 0 });
});

it("does not attribute another file's plugin source range to the current source", () => {
	const sourceText = "\n\nconst original = 1;\n";
	const source = ts.createSourceFile("input.ts", sourceText, ts.ScriptTarget.Latest, true);
	const statement = source.statements[0];
	ts.setSourceMapRange(statement, {
		pos: statement.getStart(),
		end: statement.getEnd(),
		source: ts.createSourceMapSource("other.ts", sourceText),
	});
	ts.setEmitFlags(statement, ts.EmitFlags.NoNestedSourceMaps);
	const { proxy, state, traceMap } = reprint(source);

	expect(originalPositionFor(traceMap, { line: 1, column: 0 })).toMatchObject({ source: "other.ts", line: 3 });
	expect(getOriginalSourcePosition(state, proxy.statements[0])).toEqual({ line: 0, column: 0 });
});

it.each(["/home/runner/input.ts", "D:/project/input.ts"])("resolves printer file URIs for %s", fileName => {
	const source = ts.createSourceFile(fileName, "\n\nconst original = 1;\n", ts.ScriptTarget.Latest, true);
	const { proxy, state, traceMap } = reprint(source);

	expect(originalPositionFor(traceMap, { line: 1, column: 0 }).source).toMatch(/^file:\/\/\//);
	expect(getOriginalSourcePosition(state, proxy.statements[0])).toEqual({ line: 2, column: 0 });
});
