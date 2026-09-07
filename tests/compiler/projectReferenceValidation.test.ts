import fs from "fs-extra";
import path from "path";
import { createProjectData, createProjectProgram, ProjectBuild } from "Project";
import { compileFiles } from "Project/functions/compileFiles";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { DEFAULT_PROJECT_OPTIONS } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

it.each([{ noEmit: true }, { declaration: false }])("rejects a dependency that disables emit with %j", options => {
	fixture.project("shared", [], options);
	fixture.project("game", ["shared"]);

	try {
		fixture.createBuild();
		throw new Error("Expected a reference diagnostic");
	} catch (error) {
		expect(error).toBeInstanceOf(DiagnosticError);
		if (error instanceof DiagnosticError) {
			expect(error.diagnostics.map(diagnostic => diagnostic.code)).toContain(6310);
		}
	}
});

it.each([
	["shared build info", { tsBuildInfoFile: "../cache/game.tsbuildinfo" }, /unique tsBuildInfoFile/],
	["build info in another output", { tsBuildInfoFile: "../out/game/shared.tsbuildinfo" }, /another project's output/],
	["output containing another source", { outDir: "../game" }, /contains source directory/],
	["overlapping declarations", { declarationDir: "../out/game/types" }, /overlapping output directories/],
] as const)("rejects %s before removing existing files", (_name, options, message) => {
	fixture.project("shared", [], options);
	fixture.project("game", ["shared"]);
	fixture.write("out/game/keep.luau", "return 7");

	expect(() => fixture.createBuild()).toThrow(message);
	expect(fixture.read("out/game/keep.luau")).toBe("return 7");
});

it("rejects source and asset output collisions before overwriting either output", () => {
	fixture.project("game");
	fixture.write("game/src/value.ts", "export const value = 1;");
	fixture.write("game/src/value.luau", "return { value = 2 }");
	fixture.write("out/game/value.luau", "return { value = 3 }");

	const result = fixture.createBuild().build();

	expect(result.emitSkipped).toBe(true);
	expect(formatDiagnostics(result.diagnostics)).toContain("both emit");
	expect(fixture.read("out/game/value.luau")).toBe("return { value = 3 }");
});

it("builds through an intermediate composite solution config", () => {
	fixture.project("common");
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.json("shared/tsconfig.json", {
		compilerOptions: { composite: true },
		files: [],
		references: [{ path: "../common" }],
	});

	const build = fixture.createBuild();
	expectSuccess(build.build());
	const watchPaths = build.getWatchPaths().map(file => path.normalize(file));

	expect(fixture.read("out/common/init.luau")).toContain("value = 1");
	expect(fs.existsSync(fixture.file("out/shared/init.luau"))).toBe(false);
	expect(watchPaths).toContain(fixture.file("shared/tsconfig.json"));
	expect(watchPaths).toContain(fixture.file("common/src"));
	expect(watchPaths).not.toContain(fixture.file("shared/src"));
});

it("retains output after a malformed config and rebuilds after repair", () => {
	fixture.project("game");
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const original = fixture.read("game/tsconfig.json");
	const output = fixture.read("out/game/init.luau");

	fixture.write("game/tsconfig.json", '{ "compilerOptions": { "strict": ');

	expect(() => build.build()).toThrow(DiagnosticError);
	expect(fixture.read("out/game/init.luau")).toBe(output);

	fixture.write("game/tsconfig.json", original);
	fixture.write("game/src/index.ts", "export const value = 2;");

	expectSuccess(build.build());
	expect(fixture.read("out/game/init.luau")).toContain("value = 2");
});

it("cleans empty output directories while retaining git metadata", () => {
	fixture.project("game");
	fixture.write("game/src/nested/orphan.ts", "export const orphan = 1;");
	const build = fixture.createBuild();
	expectSuccess(build.build());

	fixture.write("out/game/.git/HEAD", "ref: refs/heads/generated\n");
	fs.removeSync(fixture.file("game/src/nested"));

	expectSuccess(build.build());

	expect(fs.existsSync(fixture.file("out/game/nested"))).toBe(false);
	expect(fixture.read("out/game/.git/HEAD")).toBe("ref: refs/heads/generated\n");
});

it("imports a package subpath without a package entrypoint mapping", () => {
	fixture.project("game");
	fixture.json("node_modules/@rbxts/example/package.json", { name: "@rbxts/example", version: "1.0.0" });
	fixture.write("node_modules/@rbxts/example/helper.d.ts", "export declare const value: number;");
	fixture.write("node_modules/@rbxts/example/helper.lua", "return { value = 8 }");
	fixture.rojo({ node_modules: { "@rbxts": { $path: "node_modules/@rbxts" } } });
	fixture.write("game/src/index.ts", 'import { value } from "@rbxts/example/helper"; export const result = value;');

	expectSuccess(fixture.createBuild().build());

	expect(fixture.read("out/game/init.luau")).toContain('"node_modules", "@rbxts", "example", "helper"');
});

it("builds a package without Rojo while excluding generated output and repository metadata", () => {
	fixture.project("game", [], { composite: true, rootDir: ".", outDir: "out" });
	fixture.json("package.json", { name: "@rbxts/example" });
	fs.removeSync(fixture.file("default.project.json"));
	fixture.write("game/.git/HEAD", "ref: refs/heads/main\n");
	fixture.write("game/node_modules/nested/asset.lua", "return 5");
	fixture.write("game/out/stale.lua", "return 6");

	const build = new ProjectBuild(fixture.file("game/tsconfig.json"));
	try {
		expectSuccess(build.build());
		const watchPaths = build.getWatchPaths().map(file => path.normalize(file));

		expect(fixture.read("game/out/src/init.luau")).toContain("value = 1");
		expect(fs.existsSync(fixture.file("game/out/.git"))).toBe(false);
		expect(fs.existsSync(fixture.file("game/out/node_modules"))).toBe(false);
		expect(fs.existsSync(fixture.file("game/out/stale.lua"))).toBe(false);
		expect(watchPaths).toContain(fixture.file("game"));
		expect(build.isOutputPath(fixture.file("cache/game.tsbuildinfo"))).toBe(true);
	} finally {
		build.close();
	}
});

it("retains the single-project compiler API without a project graph", () => {
	fixture.project("game");
	const data = createProjectData(fixture.file("game/tsconfig.json"), {
		...DEFAULT_PROJECT_OPTIONS,
		...fixture.options(),
	});
	const program = createProjectProgram(data);
	const translator = createPathTranslator(program, data);

	expectSuccess(compileFiles(program.getProgram(), data, translator, getChangedSourceFiles(program)));

	expect(fixture.read("out/game/init.luau")).toContain("value = 1");
});

it.each([undefined, ["../types"], ["../node_modules/incorrect-scope"]])(
	"rejects invalid type roots %j with a configuration diagnostic",
	typeRoots => {
		fixture.project("game", [], { typeRoots });
		if (typeRoots === undefined) {
			const base = fs.readJsonSync(fixture.file("base.json"));
			delete base.compilerOptions.typeRoots;
			fixture.json("base.json", base);
		}

		expect(() => fixture.createBuild()).toThrow(/"typeRoots" must contain a node_modules\/@rbxts directory/);
	},
);

it("cleans an empty composite project's output even before its declaration directory exists", () => {
	fixture.project("game", [], { composite: true, declarationDir: "../declarations/game" });
	fs.removeSync(fixture.file("game/src/index.ts"));
	fixture.write("game/src/types.d.ts", "export interface Named { name: string; }");

	expectSuccess(fixture.createBuild().build());

	expect(fs.existsSync(fixture.file("out/game"))).toBe(true);
	expect(fs.existsSync(fixture.file("declarations/game"))).toBe(false);
});

it("disables incremental game builds in development mode while retaining composite build info", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	const globals = globalThis as typeof globalThis & { RBXTSC_DEV?: boolean };
	const previous = globals.RBXTSC_DEV;
	globals.RBXTSC_DEV = true;

	try {
		expectSuccess(fixture.createBuild().build());

		expect(fs.existsSync(fixture.file("cache/shared.tsbuildinfo"))).toBe(true);
		expect(fs.existsSync(fixture.file("cache/game.tsbuildinfo"))).toBe(false);
		expect(fixture.read("out/shared/index.d.ts")).toContain("value = 1");
		expect(fixture.read("out/game/init.luau")).toContain("value = 1");
	} finally {
		if (previous === undefined) {
			delete globals.RBXTSC_DEV;
		} else {
			globals.RBXTSC_DEV = previous;
		}
	}
});

it("propagates a transformer exception without overwriting the last successful build", () => {
	fixture.project("game", [], { composite: true, plugins: [{ transform: "../plugin.cjs" }] });
	fixture.write(
		"plugin.cjs",
		`module.exports = () => () => source => {
	if (source.text.includes("value = 2")) {
		throw new Error("plugin failed");
	}
	return source;
};`,
	);
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const output = fixture.read("out/game/init.luau");
	const declaration = fixture.read("out/game/index.d.ts");

	fixture.write("game/src/index.ts", "export const value = 2;");

	expect(() => build.build()).toThrow("plugin failed");
	expect(fixture.read("out/game/init.luau")).toBe(output);
	expect(fixture.read("out/game/index.d.ts")).toBe(declaration);

	fixture.write("game/src/index.ts", "export const value = 3;");

	expectSuccess(build.build());
	expect(fixture.read("out/game/init.luau")).toContain("value = 3");
});
