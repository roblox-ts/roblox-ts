import { GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND, originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import path from "path";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

jest.setTimeout(30000);

it("leaves synthetic plugin statements unmapped", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], {
			sourceMap: true,
			plugins: [{ transform: "../prepend.cjs" }],
		});
		fixture.write(
			"prepend.cjs",
			`module.exports = (program, config, { ts }) => () => source => {
				const synthetic = ts.factory.createExpressionStatement(
					ts.factory.createCallExpression(ts.factory.createIdentifier("print"), undefined, [
						ts.factory.createStringLiteral("synthetic plugin"),
					]),
				);
				return ts.factory.updateSourceFile(source, [synthetic, ...source.statements]);
			};`,
		);
		fixture.write("game/src/index.ts", 'print("original source");');

		expectSuccess(fixture.createBuild().build());

		const output = fixture.read("out/game/init.luau").split("\n");
		const map = new TraceMap(fixture.read("out/game/init.luau.map"));
		const syntheticLine = output.findIndex(line => line.includes("synthetic plugin")) + 1;
		const originalLine = output.findIndex(line => line.includes("original source")) + 1;
		expect(syntheticLine).toBeGreaterThan(0);
		expect(originalLine).toBeGreaterThan(0);
		expect(originalPositionFor(map, { line: syntheticLine, column: 0 }).source).toBeNull();
		expect(originalPositionFor(map, { line: originalLine, column: 0 })).toMatchObject({ line: 1, column: 0 });
	} finally {
		fixture.close();
	}
});

it("preserves plugin-reprinted comments when source maps are disabled", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], {
			plugins: [{ transform: "../identity.cjs" }],
			removeComments: true,
		});
		fixture.write("identity.cjs", "module.exports = () => () => source => source;");
		fixture.write("game/src/index.ts", "// retained in the transformed TypeScript\nexport const value = 1;");

		expectSuccess(fixture.createBuild({ writeTransformedFiles: true }).build());

		expect(fixture.read("out/game/index.transformed.ts")).toContain("// retained in the transformed TypeScript");
	} finally {
		fixture.close();
	}
});

it.each([false, true])(
	"maps plugin-reprinted statements to the original source (removeComments=%s)",
	removeComments => {
		const fixture = new ReferenceFixture();
		try {
			fixture.project("game", [], {
				sourceMap: true,
				removeComments,
				plugins: [{ transform: "../identity.cjs" }],
			});
			fixture.write(
				"identity.cjs",
				`module.exports = (program, config, { ts }) => context => source => {
					const visit = node => {
						if (ts.isStringLiteral(node) && node.text === "plugin marker") {
							return ts.setOriginalNode(ts.factory.createStringLiteral("transformed marker"), node);
						}
						return ts.visitEachChild(node, visit, context);
					};
					return ts.visitNode(source, visit);
				};`,
			);
			const source =
				'// preserve original whitespace and comment\n\nexport const callback = () => {\n\n    print("plugin marker");\n};\n';
			fixture.write("game/src/index.ts", source);
			const build = fixture.createBuild();
			expectSuccess(build.build());

			const output = fixture.read("out/game/init.luau");
			const map = new TraceMap(fixture.read("out/game/init.luau.map"));
			const line = output.split("\n").findIndex(line => line.includes('print("transformed marker")')) + 1;
			expect(line).toBeGreaterThan(0);
			expect(map.sourcesContent).toEqual([source]);
			for (const bias of [GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND] as const) {
				expect(originalPositionFor(map, { line, column: 0, bias })).toEqual({
					source: path.join("..", "..", "game", "src", "index.ts"),
					line: 5,
					column: 4,
					name: null,
				});
			}
		} finally {
			fixture.close();
		}
	},
);
