import { spawnSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { PACKAGE_ROOT } from "Shared/constants";

import { expectSuccess, ReferenceFixture, startWatch } from "../referenceFixture";

jest.setTimeout(30000);

const requiredOutputs = [
	"out/game/required.luau",
	"declarations/game/required.d.ts",
	"declarations/game/required.d.ts.map",
];
const indexOutputs = ["out/game/init.luau", "declarations/game/index.d.ts", "declarations/game/index.d.ts.map"];
const outputs = [...requiredOutputs, ...indexOutputs];

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
	fixture.project("game", [], {
		declaration: true,
		declarationDir: "../declarations/game",
		declarationMap: true,
	});
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", { ...config, files: ["src/index.ts"], include: [] });
});
afterEach(() => fixture.close());

function addRequiredRoot() {
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", { ...config, files: ["src/index.ts", "src/required.ts"] });
	fixture.write("game/src/required.ts", "export const required = 1;");
}

it("preserves outputs until the sole configured root is restored", () => {
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const previous = indexOutputs.map(output => fixture.read(output));

	fs.removeSync(fixture.file("game/src/index.ts"));
	for (let attempt = 0; attempt < 2; attempt++) {
		const result = build.build([fixture.file("game/src/index.ts")]);

		expect(result.emitSkipped).toBe(true);
		expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(6053);
		expect(result.emittedFiles).toEqual([]);
		expect(indexOutputs.map(output => fixture.read(output))).toEqual(previous);
	}

	fixture.write("game/src/index.ts", "export const value = 2;");
	expectSuccess(build.build([fixture.file("game/src/index.ts")]));
	expect(fixture.read(indexOutputs[0])).toContain("value = 2");
	expect(fixture.read(indexOutputs[1])).toContain("value = 2");
	expect(fs.existsSync(fixture.file(indexOutputs[2]))).toBe(true);
});

it("preserves plugin outputs and pending edits until a configured root is restored", () => {
	addRequiredRoot();
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", {
		...config,
		compilerOptions: { ...config.compilerOptions, plugins: [{ transform: "../plugin.cjs" }] },
	});
	fixture.write("plugin.cjs", "module.exports = () => () => source => source;");
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const previous = outputs.map(output => fixture.read(output));

	fs.removeSync(fixture.file("game/src/required.ts"));
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt === 1) {
			fixture.write("game/src/index.ts", "export const value = 2;");
		}
		const result = build.build([fixture.file("game/src/required.ts"), fixture.file("game/src/index.ts")]);

		expect(result.emitSkipped).toBe(true);
		expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(6053);
		expect(result.emittedFiles).toEqual([]);
		expect(outputs.map(output => fixture.read(output))).toEqual(previous);
	}

	fixture.write("game/src/required.ts", "export const required = 3;");
	expectSuccess(build.build([fixture.file("game/src/required.ts")]));
	expect(fixture.read(requiredOutputs[0])).toContain("required = 3");
	expect(fixture.read(requiredOutputs[1])).toContain("required = 3");
	expect(fs.existsSync(fixture.file(requiredOutputs[2]))).toBe(true);
	expect(fixture.read("out/game/init.luau")).toContain("value = 2");

	// removing a file from the config makes its old outputs legitimately stale
	const updatedConfig = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", { ...updatedConfig, files: ["src/index.ts"] });
	fs.removeSync(fixture.file("game/src/required.ts"));
	expectSuccess(build.build([fixture.file("game/tsconfig.json"), fixture.file("game/src/required.ts")]));
	for (const output of requiredOutputs) {
		expect(fs.existsSync(fixture.file(output))).toBe(false);
	}
	expect(fixture.read("out/game/init.luau")).toContain("value = 2");
});

it("accepts an extensionless configured root that TypeScript resolves", () => {
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", { ...config, files: ["src/index"] });

	expectSuccess(fixture.createBuild().build());

	expect(fixture.read("out/game/init.luau")).toContain("value = 1");
	expect(fixture.read("declarations/game/index.d.ts")).toContain("value = 1");
	expect(fs.existsSync(fixture.file("declarations/game/index.d.ts.map"))).toBe(true);
	expect(fs.existsSync(fixture.file(requiredOutputs[0]))).toBe(false);
});

it("fails a cold CLI build when an explicitly configured root is missing", () => {
	fs.removeSync(fixture.file("game/src/index.ts"));

	const result = spawnSync(
		process.execPath,
		[
			path.join(PACKAGE_ROOT, "out/CLI/cli.js"),
			"-p",
			fixture.file("game"),
			"--rojo",
			fixture.file("default.project.json"),
			"--includePath",
			fixture.file("include"),
		],
		{ cwd: fixture.directory, encoding: "utf8" },
	);

	expect(result.error).toBeUndefined();
	expect(result.signal).toBeNull();
	expect(result.status).toBe(1);
	expect(result.stdout + result.stderr).toContain("TS6053");
	for (const output of outputs) {
		expect(fs.existsSync(fixture.file(output))).toBe(false);
	}
});

it.each([false, true])("reports and recovers a missing configured root while watching (polling=%s)", async polling => {
	addRequiredRoot();
	const watch = await startWatch(fixture, polling);
	try {
		const previous = outputs.map(output => fixture.read(output));
		let logStart = watch.log.length;
		await watch.edit(() => fs.removeSync(fixture.file("game/src/required.ts")));

		expect(watch.log.slice(logStart)).toContain("TS6053");
		expect(outputs.map(output => fixture.read(output))).toEqual(previous);

		logStart = watch.log.length;
		await watch.edit(() => fixture.write("game/src/index.ts", "export const value = 2;"));

		expect(watch.log.slice(logStart)).toContain("TS6053");
		expect(outputs.map(output => fixture.read(output))).toEqual(previous);

		await watch.edit(() => fixture.write("game/src/required.ts", "export const required = 3;"));

		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
		expect(fixture.read(requiredOutputs[0])).toContain("required = 3");
		expect(fixture.read(requiredOutputs[1])).toContain("required = 3");
		expect(fs.existsSync(fixture.file(requiredOutputs[2]))).toBe(true);
		expect(fixture.read("out/game/init.luau")).toContain("value = 2");
	} finally {
		await watch.close();
	}
});
