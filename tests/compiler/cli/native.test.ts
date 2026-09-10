import { spawnSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { COMPILER_VERSION, PACKAGE_ROOT } from "Shared/constants";

import { ReferenceFixture } from "../referenceFixture";

jest.setTimeout(30000);

function run(args: Array<string>, cwd = PACKAGE_ROOT) {
	const result = spawnSync(process.execPath, [path.join(PACKAGE_ROOT, "out/CLI/cli.js"), ...args], {
		cwd,
		encoding: "utf8",
		timeout: 20000,
	});
	if (result.error) {
		throw result.error;
	}
	expect(result.signal).toBeNull();
	return { status: result.status, output: result.stdout + result.stderr };
}

it("prints help with public flags and hides internal options", () => {
	const result = run(["--help"]);

	expect(result.status).toBe(0);
	expect(result.output).toContain("A TypeScript-to-Luau Compiler for Roblox");
	expect(result.output).toContain("--project");
	expect(result.output).toContain("--usePolling");
	expect(result.output).not.toContain("--writeTransformedFiles");
});

it("prints the compiler version", () => {
	const result = run(["-v"]);

	expect(result.status).toBe(0);
	expect(result.output.trim()).toBe(COMPILER_VERSION);
});

it.each([
	[["--invalid-option"], "Unknown argument"],
	[["--usePolling"], "watch"],
	[["--type", "invalid"], "Invalid values"],
])("rejects invalid command arguments %j", (args, message) => {
	const result = run(args);

	expect(result.status).toBe(1);
	expect(result.output).toContain(message);
});

it.each([false, true])("builds a project through the native CLI (explicit command: %s)", explicit => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game");
		const result = run(
			[
				...(explicit ? ["build", "-p", fixture.file("game/tsconfig.json")] : []),
				"--rojo",
				fixture.file("default.project.json"),
				"-i",
				fixture.file("include"),
				"--noInclude",
				"--luau=false",
			],
			fixture.file("game"),
		);

		expect(result.status).toBe(0);
		expect(fixture.read("out/game/init.lua")).toContain("local value = 1");
		expect(fs.existsSync(fixture.file("include/RuntimeLib.lua"))).toBe(false);
	} finally {
		fixture.close();
	}
});

it.each([false, true])("prints build errors and exits unsuccessfully (missing configuration: %s)", missing => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game");
		fixture.write("game/src/index.ts", 'export const value: number = "invalid";');
		const result = run([
			"-p",
			fixture.file(missing ? "missing" : "game"),
			"--rojo",
			fixture.file("default.project.json"),
			"-i",
			fixture.file("include"),
		]);

		expect(result.status).toBe(1);
		expect(result.output).toContain(
			missing ? "Unable to find tsconfig.json!" : "Type 'string' is not assignable to type 'number'",
		);
		expect(fs.existsSync(fixture.file("out/game/init.luau"))).toBe(false);
	} finally {
		fixture.close();
	}
});
