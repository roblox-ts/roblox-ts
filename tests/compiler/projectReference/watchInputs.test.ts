import path from "path";
import { projectPathKey } from "Project/classes/ProjectGraph";

import { expectSuccess, ReferenceFixture, startWatch } from "../referenceFixture";

jest.setTimeout(30000);

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

it("resolves a changed package entry point on the next source edit", () => {
	fixture.project("game");
	fixture.json("node_modules/@rbxts/options/package.json", { name: "@rbxts/options", types: "number.d.ts" });
	fixture.write("node_modules/@rbxts/options/number.d.ts", "export interface Options { value: number; }");
	fixture.write("node_modules/@rbxts/options/string.d.ts", "export interface Options { value: string; }");
	const source = 'import { Options } from "@rbxts/options"; export const value: Options = { value: 1 };';
	fixture.write("game/src/index.ts", source);
	fixture.write("game/src/trigger.ts", "export const changed = false;");
	const build = fixture.createBuild();
	expectSuccess(build.build());

	fixture.json("node_modules/@rbxts/options/package.json", { name: "@rbxts/options", types: "string.d.ts" });
	fixture.write("game/src/trigger.ts", "export const changed = true;");
	const result = build.build([fixture.file("game/src/trigger.ts")]);

	expect(result.emitSkipped).toBe(true);
	expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(2322);
});

it("keeps reporting the same failed edit until it is repaired", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write(
		"game/src/index.ts",
		'import { value } from "../../shared/src"; export const result: number = value;',
	);
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const original = fixture.read("out/game/init.luau");

	fixture.write("shared/src/index.ts", 'export const value = "wrong";');
	for (let index = 0; index < 2; index++) {
		const result = build.build([fixture.file("shared/src/index.ts")]);
		expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(2322);
		expect(fixture.read("out/game/init.luau")).toBe(original);
	}

	fixture.write("shared/src/index.ts", "export const value = 2;");
	expectSuccess(build.build([fixture.file("shared/src/index.ts")]));
});

it("watches roots and external declarations without subscribing to installed type files", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write("external/types.d.ts", "export interface Options { value: number; }");
	fixture.write(
		"game/src/index.ts",
		'import { Options } from "../../external/types"; export const options: Options = { value: 1 };',
	);
	const build = fixture.createBuild();
	expectSuccess(build.build());

	const paths = build.getWatchPaths().map(projectPathKey);
	expect(paths).toContain(projectPathKey(fixture.file("game/src")));
	expect(paths).toContain(projectPathKey(fixture.file("shared/src")));
	expect(paths).toContain(projectPathKey(fixture.file("external/types.d.ts")));
	expect(paths).not.toContain(projectPathKey(fixture.file("game/src/index.ts")));
	expect(paths.some(file => file.split(path.sep).includes("node_modules"))).toBe(false);
});

it("recognizes package updates on the next source edit without watching node_modules", async () => {
	fixture.project("game");
	fixture.json("node_modules/@rbxts/options/package.json", { name: "@rbxts/options", types: "index.d.ts" });
	fixture.write("node_modules/@rbxts/options/index.d.ts", "export interface Options { value: number; }");
	const source = 'import { Options } from "@rbxts/options"; export const options: Options = { value: 1 };';
	fixture.write("game/src/index.ts", source);
	const watch = await startWatch(fixture);
	try {
		await watch.expectNoBuild(() =>
			fixture.write("node_modules/@rbxts/options/index.d.ts", "export interface Options { value: string; }"),
		);
		await watch.edit(() => fixture.write("game/src/index.ts", `${source}\nprint(options);`));
		expect(watch.log.slice(watch.log.lastIndexOf("Starting incremental"))).toContain("TS2322");
	} finally {
		await watch.close();
	}
});
