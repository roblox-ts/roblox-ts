import { spawnSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { COMPILER_VERSION, PACKAGE_ROOT } from "Shared/constants";

import { ReferenceFixture } from "../referenceFixture";
import { RojoFixture } from "./rojoFixture";

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

it.each(["sourcemap", "typegen"])("prints help for %s", command => {
	const result = run([command, "--help"]);

	expect(result.status).toBe(0);
	expect(result.output).toContain("--project");
	expect(result.output).toContain("--rojo");
});

it.each(["positional", "project flag", "config file"])("generates sourcemaps through the CLI using %s", selection => {
	const fixture = new RojoFixture();
	try {
		const args =
			selection === "positional"
				? [fixture.file("game")]
				: ["-p", fixture.file(selection === "config file" ? "game/tsconfig.json" : "game")];
		const result = fixture.run(["sourcemap", ...args]);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		expect(JSON.parse(result.stdout).children[0].children[0].filePaths).toEqual([path.join("src", "index.ts")]);
	} finally {
		fixture.close();
	}
});

it("honors sourcemap output, Rojo selection, and non-script flags through the CLI", () => {
	const fixture = new RojoFixture();
	try {
		fixture.tree(
			{ $className: "DataModel", Workspace: { $className: "Workspace", Part: { $className: "Part" } } },
			"custom.project.json",
		);

		const result = fixture.run([
			"sourcemap",
			"-p",
			fixture.file("game"),
			"--rojo",
			"custom.project.json",
			"--include-non-scripts",
			"-o",
			"map.json",
		]);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
		expect(fs.readJsonSync(fixture.file("map.json")).children[0].children[0].name).toBe("Part");
	} finally {
		fixture.close();
	}
});

it("generates service declarations through the CLI", () => {
	const fixture = new RojoFixture();
	try {
		fixture.tree(
			{
				$className: "DataModel",
				Workspace: {
					$className: "Workspace",
					Terrain: { $className: "Terrain", Attachment: { $className: "Attachment" } },
				},
			},
			"custom.project.json",
		);

		const result = fixture.run(["typegen", "-p", fixture.file("game"), "--rojo", "custom.project.json"]);

		expect(result.status).toBe(0);
		expect(fixture.read("game/src/services.d.ts")).toContain("interface Terrain");
		expect(fixture.read("game/src/services.d.ts")).not.toContain("readonly Terrain:");
	} finally {
		fixture.close();
	}
});

it.each(["sourcemap", "typegen"])("reports a missing Rojo project through %s", command => {
	const fixture = new RojoFixture();
	try {
		fs.removeSync(fixture.file("game/default.project.json"));

		const result = fixture.run([command, "-p", fixture.file("game")]);

		expect(result.status).toBe(1);
		expect(result.stdout + result.stderr).toContain("Unable to find a Rojo project file");
	} finally {
		fixture.close();
	}
});

it("reports a missing Rojo executable through the CLI", () => {
	const fixture = new RojoFixture();
	try {
		const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"));
		const result = fixture.run(["typegen", "-p", fixture.file("game")], fixture.directory, {
			...env,
			PATH: fixture.file("missing-bin"),
		});

		expect(result.status).toBe(1);
		expect(result.stdout + result.stderr).toContain("Rojo is not installed");
	} finally {
		fixture.close();
	}
});
