import fs from "fs-extra";

import { expectSuccess, ReferenceFixture, startWatch } from "../referenceFixture";

jest.setTimeout(60000);

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

function declarations(project = "game") {
	fixture.write(`${project}/src/models/model.d.ts`, "export interface Model { value: number; }");
	fixture.write(`${project}/src/public.d.ts`, 'export { Model } from "models/model";');
}

it("rewrites declarations consumed by a referenced project without changing their sources", () => {
	fixture.project("shared", [], { baseUrl: "src" });
	fixture.project("game", ["shared"]);
	declarations("shared");
	fixture.write("shared/src/index.ts", 'export type { Model } from "./public";');
	fixture.write(
		"game/src/index.ts",
		'import type { Model } from "../../out/shared"; export const value: Model = { value: 1 };',
	);
	const original = fixture.read("shared/src/public.d.ts");
	const build = fixture.createBuild();

	expectSuccess(build.build());

	expect(fixture.read("out/shared/public.d.ts")).toBe('export { Model } from "./models/model";\n');
	expect(fixture.read("out/shared/index.d.ts")).toBe('export type { Model } from "./public";\n');
	expect(fixture.read("out/game/init.luau")).toContain("value = 1");
	expect(fixture.read("shared/src/public.d.ts")).toBe(original);

	// a fresh build must also consume the emitted declarations when build info skips the dependency
	expectSuccess(fixture.createBuild().build());
});

it.each(["../out/game", "../out/game/nested"])(
	"leaves external declaration inputs unchanged with outDir=%s",
	outDir => {
		fixture.project("game", [], { declaration: true, baseUrl: "src", outDir });
		declarations();
		fixture.write("external/types.d.ts", "export interface External { value: number; }");
		fixture.write(
			"game/src/index.ts",
			'import type { External } from "../../external/types"; export const value: External = { value: 1 };',
		);
		const paths = ["external/types.d.ts", "node_modules/@rbxts/compiler-types/types/core.d.ts"];
		const original = paths.map(file => fixture.read(file));
		const timestamp = new Date("2020-01-01T00:00:00Z");
		for (const file of paths) {
			fs.utimesSync(fixture.file(file), timestamp, timestamp);
		}

		expectSuccess(fixture.createBuild().build());

		expect(paths.map(file => fixture.read(file))).toEqual(original);
		for (const file of paths) {
			expect(fs.statSync(fixture.file(file)).mtimeMs).toBe(timestamp.getTime());
		}
		expect(fixture.read(`game/${outDir}/public.d.ts`)).toBe('export { Model } from "./models/model";\n');
		expect(fs.existsSync(fixture.file("out/node_modules"))).toBe(false);
		expect(fs.existsSync(fixture.file("out/external"))).toBe(false);
	},
);

it("rewrites declaration assets excluded from the TypeScript input set", () => {
	fixture.project("game", [], { declaration: true, baseUrl: "src" });
	declarations();
	fixture.write("game/src/public.luau", "return {}\n");
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.include = ["src/index.ts"];
	fixture.json("game/tsconfig.json", config);

	expectSuccess(fixture.createBuild().build());

	expect(fixture.read("out/game/public.d.ts")).toBe('export { Model } from "./models/model";\n');
	expect(fixture.read("out/game/models/model.d.ts")).toContain("value: number");
	expect(fixture.read("out/game/public.luau")).toBe("return {}\n");
});

it("decodes UTF-16 declaration assets without changing their input encoding", () => {
	fixture.project("game", [], { declaration: true, baseUrl: "src" });
	declarations();
	const contents = Buffer.from('\uFEFFexport { Model } from "models/model";', "utf16le");
	fs.writeFileSync(fixture.file("game/src/public.d.ts"), contents);

	expectSuccess(fixture.createBuild().build());

	expect(fixture.read("out/game/public.d.ts")).toBe('export { Model } from "./models/model";\n');
	expect(fs.readFileSync(fixture.file("game/src/public.d.ts"))).toEqual(contents);
});

it.each([false, true])("updates and recreates declaration assets with writeOnlyChanged=%s", writeOnlyChanged => {
	fixture.project("game", [], { declaration: true, baseUrl: "src" });
	declarations();
	const build = fixture.createBuild({ writeOnlyChanged });
	expectSuccess(build.build());
	const output = fixture.file("out/game/public.d.ts");
	const timestamp = new Date("2020-01-01T00:00:00Z");
	fs.utimesSync(output, timestamp, timestamp);

	expectSuccess(build.build());

	expect(fs.statSync(output).mtimeMs === timestamp.getTime()).toBe(writeOnlyChanged);
	expect(fixture.read("out/game/public.d.ts")).toBe('export { Model } from "./models/model";\n');

	fixture.write("game/src/public.d.ts", 'export type { Model } from "models/model";');
	expectSuccess(build.build([fixture.file("game/src/public.d.ts")]));

	expect(fixture.read("out/game/public.d.ts")).toBe('export type { Model } from "./models/model";\n');

	fs.removeSync(output);
	expectSuccess(build.build());

	expect(fixture.read("out/game/public.d.ts")).toBe('export type { Model } from "./models/model";\n');
});

it("preserves existing declaration assets until a failed build recovers", () => {
	fixture.project("game", [], { declaration: true, baseUrl: "src" });
	declarations();
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const original = fixture.read("out/game/public.d.ts");

	fixture.write("game/src/public.d.ts", 'export type { Model } from "models/model";');
	fixture.write("game/src/added.d.ts", 'export { Model } from "models/model";');
	fixture.write("game/src/index.ts", 'export const value: number = "invalid";');

	expect(build.build().emitSkipped).toBe(true);
	expect(fixture.read("out/game/public.d.ts")).toBe(original);
	expect(fs.existsSync(fixture.file("out/game/added.d.ts"))).toBe(false);

	fixture.write("game/src/index.ts", "export const value = 2;");
	expectSuccess(build.build());

	expect(fixture.read("out/game/public.d.ts")).toBe('export type { Model } from "./models/model";\n');
	expect(fixture.read("out/game/added.d.ts")).toBe('export { Model } from "./models/model";\n');
});

it("removes declaration assets when declaration emission is disabled", () => {
	fixture.project("game", [], { declaration: true, baseUrl: "src" });
	declarations();
	const build = fixture.createBuild();
	expectSuccess(build.build());
	expect(fs.existsSync(fixture.file("out/game/public.d.ts"))).toBe(true);

	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.compilerOptions.declaration = false;
	fixture.json("game/tsconfig.json", config);
	expectSuccess(build.build([fixture.file("game/tsconfig.json")]));

	expect(fs.existsSync(fixture.file("out/game/public.d.ts"))).toBe(false);
	expect(fs.existsSync(fixture.file("out/game/models/model.d.ts"))).toBe(false);
	expect(fixture.read("game/src/public.d.ts")).toBe('export { Model } from "models/model";');
});

it.each([false, true])("watches declaration additions, edits, and removals with incremental=%s", async incremental => {
	fixture.project("game", [], { declaration: true, baseUrl: "src", incremental });
	declarations();
	const watch = await startWatch(fixture, true);
	try {
		expect(fixture.read("out/game/public.d.ts")).toBe('export { Model } from "./models/model";\n');

		await watch.edit(() => fixture.write("game/src/public.d.ts", 'export type { Model } from "models/model";'));

		expect(fixture.read("out/game/public.d.ts")).toBe('export type { Model } from "./models/model";\n');

		await watch.edit(() => fixture.write("game/src/nested/added.d.ts", 'export { Model } from "models/model";'));

		expect(fixture.read("out/game/nested/added.d.ts")).toBe('export { Model } from "../models/model";\n');

		await watch.edit(() => fs.removeSync(fixture.file("game/src/nested/added.d.ts")));

		expect(fs.existsSync(fixture.file("out/game/nested/added.d.ts"))).toBe(false);
		expect(watch.log).not.toMatch(/Found [1-9]\d* errors?/);
	} finally {
		await watch.close();
	}
});
