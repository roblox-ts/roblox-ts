import fs from "fs-extra";

import { expectSuccess, ReferenceFixture } from "../referenceFixture";

it.each([{ files: ["src/index.ts"], include: [] }, { exclude: ["src/helper.ts"] }])(
	"retains imported outputs outside the configured root file list: %j",
	selection => {
		const fixture = new ReferenceFixture();
		try {
			fixture.project("game", [], {
				declaration: true,
				declarationDir: "../declarations/game",
				declarationMap: true,
			});
			const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
			fixture.json("game/tsconfig.json", { ...config, ...selection });
			fixture.write("game/src/helper.ts", "export const value = 42;");
			fixture.write("game/src/index.ts", 'export { value } from "./helper";');
			const build = fixture.createBuild();
			const outputs = [
				"out/game/helper.luau",
				"declarations/game/helper.d.ts",
				"declarations/game/helper.d.ts.map",
			];

			expectSuccess(build.build());

			expect(fixture.read(outputs[0])).toContain("value = 42");
			expect(fixture.read(outputs[1])).toContain("value = 42");
			expect(fs.existsSync(fixture.file(outputs[2]))).toBe(true);

			for (const output of outputs) {
				fs.removeSync(fixture.file(output));
			}
			expectSuccess(fixture.createBuild().build());
			for (const output of outputs) {
				expect(fs.existsSync(fixture.file(output))).toBe(true);
			}

			fixture.write("game/src/helper.ts", "export const value = 43;");
			expectSuccess(build.build([fixture.file("game/src/helper.ts")]));
			expect(fixture.read(outputs[0])).toContain("value = 43");
			expect(fixture.read(outputs[1])).toContain("value = 43");

			// a source that is no longer imported must still lose its stale outputs
			fixture.write("game/src/index.ts", "export const value = 1;");
			expectSuccess(build.build([fixture.file("game/src/index.ts")]));
			for (const output of outputs) {
				expect(fs.existsSync(fixture.file(output))).toBe(false);
			}
		} finally {
			fixture.close();
		}
	},
);

it("copies JSON imports as assets without assigning compiled outputs", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { declaration: true, resolveJsonModule: true });
		fixture.json("game/src/settings.json", { value: 42 });
		fixture.write(
			"game/src/index.ts",
			'import settings from "./settings.json"; export const value = settings.value;',
		);

		expectSuccess(fixture.createBuild().build());

		expect(fixture.read("out/game/settings.json")).toBe(fixture.read("game/src/settings.json"));
		expect(fixture.read("out/game/init.luau")).toContain('"settings"');
		expect(fs.existsSync(fixture.file("out/game/settings.luau"))).toBe(false);
		expect(fs.existsSync(fixture.file("out/game/settings.d.ts"))).toBe(false);
	} finally {
		fixture.close();
	}
});

it("preserves unchanged declaration and map files when writeOnlyChanged is enabled", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { declaration: true, declarationMap: true });
		fixture.write("game/src/index.ts", "export function value(input: number) { return input + 1; }");
		const build = fixture.createBuild({ writeOnlyChanged: true });
		expectSuccess(build.build());
		const files = ["out/game/index.d.ts", "out/game/index.d.ts.map"];
		const before = files.map(file => fixture.read(file));
		const timestamp = new Date("2020-01-01T00:00:00Z");
		for (const file of files) {
			fs.utimesSync(fixture.file(file), timestamp, timestamp);
		}

		fixture.write("game/src/index.ts", "export function value(input: number) { return input + 2; }");
		expectSuccess(build.build([fixture.file("game/src/index.ts")]));

		expect(fixture.read("out/game/init.luau")).toContain("input + 2");
		expect(files.map(file => fixture.read(file))).toEqual(before);
		for (const file of files) {
			expect(fs.statSync(fixture.file(file)).mtimeMs).toBe(timestamp.getTime());
		}
	} finally {
		fixture.close();
	}
});
