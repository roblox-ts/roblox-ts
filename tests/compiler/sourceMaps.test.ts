import { GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND, originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import fs from "fs-extra";
import path from "path";
import { PACKAGE_ROOT } from "Shared/constants";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

jest.setTimeout(30000);

interface MappingExpectation {
	marker: string;
	occurrence?: number;
	line: number;
	column: number;
}

const MAPPING_EXPECTATIONS: ReadonlyArray<MappingExpectation> = [
	{ marker: '"probe:named"', line: 2, column: 4 },
	{ marker: '"probe:if"', line: 4, column: 8 },
	{ marker: '"probe:elseif"', line: 6, column: 8 },
	{ marker: '"probe:else"', line: 8, column: 8 },
	{ marker: '"probe:for"', line: 11, column: 8 },
	{ marker: '"probe:while"', line: 14, column: 8 },
	{ marker: '"probe:repeat"', line: 18, column: 8 },
	{ marker: '"probe:arrow"', line: 22, column: 4 },
	{ marker: '"probe:returned"', line: 26, column: 8 },
	{ marker: '"probe:method"', line: 31, column: 8 },
	{ marker: '"probe:array"', line: 35, column: 4 },
	{ marker: '"probe:object"', line: 38, column: 4 },
	{ marker: '"probe:callback"', line: 43, column: 4 },
	{ marker: '"probe:nested-callback"', line: 47, column: 8 },
	{ marker: '"probe:condition"', line: 51, column: 4 },
	{ marker: '"probe:then"', line: 54, column: 4 },
	{ marker: '"probe:after-multiline-string"', line: 58, column: 0 },
	{ marker: '"probe:unicode"', line: 59, column: 0 },
	{ marker: '"probe:same-body"', occurrence: 0, line: 63, column: 8 },
	{ marker: '"probe:same-body"', occurrence: 1, line: 66, column: 8 },
	{ marker: '"probe:computed-access"', line: 72, column: 8 },
	{ marker: '"probe:property-receiver"', line: 77, column: 4 },
	{ marker: '"probe:binary"', line: 81, column: 4 },
	{ marker: '"probe:unary"', line: 85, column: 4 },
	{ marker: '"probe:conditional-true"', line: 90, column: 8 },
	{ marker: '"probe:conditional-false"', line: 94, column: 8 },
	{ marker: '"probe:interpolation"', line: 98, column: 4 },
	{ marker: '"probe:set"', line: 102, column: 4 },
	{ marker: '"probe:range-start"', line: 109, column: 8 },
	{ marker: '"probe:range-end"', line: 113, column: 8 },
	{ marker: '"probe:range-step"', line: 117, column: 8 },
	{ marker: '"probe:range-body"', line: 121, column: 4 },
	{ marker: '"probe:range-no-step"', line: 124, column: 4 },
	{ marker: '"probe:static-method"', line: 128, column: 8 },
	{ marker: '"probe:final"', line: 131, column: 0 },
];

function readMappingSource(): string {
	return fs.readFileSync(path.join(PACKAGE_ROOT, "tests/compiler/fixtures/sourceMaps.ts.txt"), "utf8");
}

function setSourceMap(fixture: ReferenceFixture, sourceMap: boolean): void {
	const config = JSON.parse(fixture.read("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", {
		...config,
		compilerOptions: { ...config.compilerOptions, sourceMap },
	});
}

function normalizeSource(source: string | null): string | null {
	return source?.replace(/\\/g, "/") ?? null;
}

it("maps generated statements to the original TypeScript positions", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		const source = readMappingSource();
		fixture.write("game/src/index.ts", source);
		expectSuccess(fixture.createBuild().build());

		const output = fixture.read("out/game/init.luau");
		const map = new TraceMap(fixture.read("out/game/init.luau.map"));
		for (const expectation of MAPPING_EXPECTATIONS) {
			const generatedLines = output
				.split("\n")
				.flatMap((line, index) => (line.includes(expectation.marker) ? [index + 1] : []));
			const generatedLine = generatedLines[expectation.occurrence ?? 0];
			expect(generatedLine).toBeDefined();
			for (const bias of [GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND] as const) {
				const original = originalPositionFor(map, { line: generatedLine!, column: 0, bias });
				expect({ ...original, source: normalizeSource(original.source) }).toEqual({
					source: "../../game/src/index.ts",
					line: expectation.line,
					column: expectation.column,
					name: null,
				});
			}
		}

		expect(map.version).toBe(3);
		expect(map.file).toBe("init.luau");
		expect(map.sourcesContent).toEqual([source]);
	} finally {
		fixture.close();
	}
});

it("maps each callback closing keyword to its own TypeScript function", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		fixture.write(
			"game/src/index.ts",
			`declare function consumePair(first: () => void, second: () => void): void;
consumePair(
	() => {
		print("first callback");
	},
	() => {
		print("second callback");
	},
);`,
		);

		expectSuccess(fixture.createBuild().build());

		const output = fixture.read("out/game/init.luau").split("\n");
		const map = new TraceMap(fixture.read("out/game/init.luau.map"));
		for (const [marker, originalLine] of [
			["first callback", 5],
			["second callback", 8],
		] as const) {
			const bodyLine = output.findIndex(line => line.includes(marker));
			expect(bodyLine).toBeGreaterThan(-1);
			expect(output[bodyLine + 1]?.trimStart()).toMatch(/^end/);
			expect(originalPositionFor(map, { line: bodyLine + 2, column: 0 })).toMatchObject({
				line: originalLine,
				column: 1,
			});
		}
	} finally {
		fixture.close();
	}
});

it("keeps a statement mapping when an inline callback closes on the same line", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		fixture.write("game/src/index.ts", "export const callback = () => {};");

		expectSuccess(fixture.createBuild().build());

		const output = fixture.read("out/game/init.luau").split("\n");
		const generatedLine = output.findIndex(line => line.includes("callback = function() end")) + 1;
		expect(generatedLine).toBeGreaterThan(0);
		const map = new TraceMap(fixture.read("out/game/init.luau.map"));
		for (const bias of [GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND] as const) {
			expect(originalPositionFor(map, { line: generatedLine, column: 0, bias })).toMatchObject({
				line: 1,
				column: 0,
			});
		}
	} finally {
		fixture.close();
	}
});

it("removes a stale map only after a successful build with source maps disabled", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		fixture.write("game/src/index.ts", 'export const lifecycle = "before";');
		const build = fixture.createBuild();
		expectSuccess(build.build());
		const outputPath = "out/game/init.luau";
		const mapPath = `${outputPath}.map`;
		const previousOutput = fixture.read(outputPath);

		setSourceMap(fixture, false);
		expectSuccess(build.build([fixture.file("game/tsconfig.json")]));
		expect(fixture.read(outputPath)).toBe(previousOutput);
		expect(fs.existsSync(fixture.file(mapPath))).toBe(false);

		setSourceMap(fixture, true);
		expectSuccess(build.build([fixture.file("game/tsconfig.json")]));
		expect(fixture.read(outputPath)).toBe(previousOutput);
		const previousMap = fixture.read(mapPath);

		setSourceMap(fixture, false);
		fixture.write("game/src/index.ts", "export const broken = ;");
		const failed = build.build([fixture.file("game/tsconfig.json"), fixture.file("game/src/index.ts")]);
		expect(failed.emitSkipped).toBe(true);
		expect(fixture.read(outputPath)).toBe(previousOutput);
		expect(fixture.read(mapPath)).toBe(previousMap);

		fixture.write("game/src/index.ts", 'export const lifecycle = "after";');
		expectSuccess(build.build([fixture.file("game/src/index.ts")]));
		const withoutMap = fixture.read(outputPath);
		expect(withoutMap).toContain('lifecycle = "after"');
		expect(fs.existsSync(fixture.file(mapPath))).toBe(false);

		setSourceMap(fixture, true);
		expectSuccess(build.build([fixture.file("game/tsconfig.json")]));
		expect(fixture.read(outputPath)).toBe(withoutMap);
		expect(fs.existsSync(fixture.file(mapPath))).toBe(true);
	} finally {
		fixture.close();
	}
});

it("rebuilds a missing map and removes outputs when their source is deleted", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		fixture.write("game/src/nested/value.ts", "export const nested = 1;");
		const build = fixture.createBuild();
		expectSuccess(build.build());
		const outputPath = "out/game/nested/value.luau";
		const mapPath = `${outputPath}.map`;
		fs.removeSync(fixture.file(mapPath));

		expectSuccess(build.build());
		expect(fs.existsSync(fixture.file(mapPath))).toBe(true);

		fs.removeSync(fixture.file("game/src/nested/value.ts"));
		expectSuccess(build.build([fixture.file("game/src/nested/value.ts")]));
		expect(fs.existsSync(fixture.file(outputPath))).toBe(false);
		expect(fs.existsSync(fixture.file(mapPath))).toBe(false);
	} finally {
		fixture.close();
	}
});

it("updates a changed map when writeOnlyChanged preserves identical Luau", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		const sourcePath = "game/src/index.ts";
		fixture.write(sourcePath, 'export const callback = () => {\n\tprint("map-only");\n};');
		const build = fixture.createBuild({ writeOnlyChanged: true });
		expectSuccess(build.build());
		const outputPath = fixture.file("out/game/init.luau");
		const mapPath = `${outputPath}.map`;
		const output = fs.readFileSync(outputPath, "utf8");
		const previousMap = fs.readFileSync(mapPath, "utf8");

		fixture.write(sourcePath, 'export const callback = () => {\n\n\tprint("map-only");\n};');
		const result = build.build([fixture.file(sourcePath)]);
		expectSuccess(result);

		expect(fs.readFileSync(outputPath, "utf8")).toBe(output);
		expect(fs.readFileSync(mapPath, "utf8")).not.toBe(previousMap);
		expect(result.emittedFiles).toContain(mapPath);
		expect(result.emittedFiles).not.toContain(outputPath);
		const map = new TraceMap(fs.readFileSync(mapPath, "utf8"));
		const generatedLine = output.split("\n").findIndex(line => line.includes('print("map-only")')) + 1;
		expect(originalPositionFor(map, { line: generatedLine, column: 0 })).toMatchObject({ line: 3, column: 1 });
	} finally {
		fixture.close();
	}
});

it.each([
	["empty.ts", ""],
	["types.ts", "export interface OnlyType { value: number }"],
])("emits a valid source map for %s", (fileName, source) => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		fixture.write(`game/src/${fileName}`, source);
		expectSuccess(fixture.createBuild().build());
		const outputName = fileName.replace(/\.ts$/, ".luau");
		const map = new TraceMap(fixture.read(`out/game/${outputName}.map`));

		expect(map.version).toBe(3);
		expect(map.file).toBe(outputName);
		expect(normalizeSource(map.sources[0])).toBe(`../../game/src/${fileName}`);
		expect(map.sourcesContent).toEqual([source]);
	} finally {
		fixture.close();
	}
});

it("emits portable literal paths for source map consumers", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		const sourcePath = "game/src/path edge #100% 雪/index.ts";
		const outputPath = "out/game/path edge #100% 雪/init.luau";
		const source = 'export const marker = "portable path";';
		fixture.write(sourcePath, source);

		expectSuccess(fixture.createBuild().build());

		const rawMap = JSON.parse(fixture.read(`${outputPath}.map`));
		expect(rawMap.sources).toEqual(["../../../game/src/path edge #100% 雪/index.ts"]);
		expect(rawMap.sourcesContent).toEqual([source]);

		const output = fixture.read(outputPath);
		const generatedLine = output.split("\n").findIndex(line => line.includes('marker = "portable path"')) + 1;
		const original = originalPositionFor(new TraceMap(rawMap), { line: generatedLine, column: 0 });
		expect(original.source).toBe(rawMap.sources[0]);
		expect(path.resolve(path.dirname(fixture.file(outputPath)), original.source!)).toBe(fixture.file(sourcePath));
	} finally {
		fixture.close();
	}
});

it.each([false, true])("uses the generated %s extension for nested index source maps", luau => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { sourceMap: true });
		fixture.write("game/src/nested/index.ts", 'export const nested = "extension";');
		expectSuccess(fixture.createBuild({ luau }).build());
		const extension = luau ? "luau" : "lua";
		const outputPath = `out/game/nested/init.${extension}`;
		const map = new TraceMap(fixture.read(`${outputPath}.map`));

		expect(fixture.read(outputPath)).toContain('nested = "extension"');
		expect(map.file).toBe(`init.${extension}`);
		expect(normalizeSource(map.sources[0])).toBe("../../../game/src/nested/index.ts");
		expect(fs.existsSync(fixture.file(`out/game/nested/init.${luau ? "lua" : "luau"}.map`))).toBe(false);
	} finally {
		fixture.close();
	}
});
