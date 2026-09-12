import sourcemap from "CLI/commands/sourcemap";
import { RojoSourceMap } from "CLI/util/getRojoSourceMap";
import fs from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import type yargs from "yargs";

import { RojoFixture } from "./rojoFixture";

let fixture: RojoFixture;

beforeEach(() => {
	fixture = new RojoFixture();
});

afterEach(() => {
	fixture.close();
	jest.restoreAllMocks();
});

async function generate(options = {}) {
	const output = fixture.file("sourcemap.json");
	await sourcemap.handler({ _: [], $0: "rbxtsc", project: fixture.file("game"), output, ...options });
	return fs.readJsonSync(output) as RojoSourceMap;
}

function collectPaths(sourceMap: RojoSourceMap): Array<string> {
	return [...(sourceMap.filePaths ?? []), ...(sourceMap.children ?? []).flatMap(collectPaths)].map(file =>
		file.split(path.sep).join("/"),
	);
}

it("registers flags on the supplied command parser", () => {
	const option = jest.fn().mockReturnThis();
	if (typeof sourcemap.builder !== "function") {
		throw new Error("Expected a command builder");
	}

	sourcemap.builder({ option } as unknown as yargs.Argv);

	expect(option.mock.calls.map(([name]) => name)).toEqual(["rojo", "project", "output", "include-non-scripts"]);
});

it.each(["game", "game/tsconfig.json", "game/src"])("resolves the project selected through %s", async project => {
	const sourceMap = await generate({ project: fixture.file(project) });

	expect(collectPaths(sourceMap)).toEqual(["default.project.json", "src/index.ts"]);
});

it.each([".lua", ".luau"])("translates %s paths relative to a nested Rojo project", async extension => {
	fixture.json("game/tsconfig.json", {
		extends: "../base.json",
		compilerOptions: { rootDir: "src", outDir: "../out/game" },
		rbxts: { luau: extension === ".luau" },
	});
	fixture.write("game/src/main.server.ts", "export {};");
	fixture.write("game/src/ui.client.tsx", "export {};");
	fixture.write("game/src/..cache/value.ts", "export {};");
	fixture.write(`out/game/main.server${extension}`, "return {}\n");
	fixture.write(`out/game/ui.client${extension}`, "return {}\n");
	fixture.write(`out/game/..cache/value${extension}`, "return {}\n");
	fixture.write("out/game/copied.luau", "return {}\n");
	fixture.write("game/src/copied.luau", "return {}\n");
	fixture.write("out/game/stale.luau", "return {}\n");
	fixture.write("external.luau", "return {}\n");
	fixture.tree(
		{
			$className: "DataModel",
			ReplicatedStorage: {
				$className: "ReplicatedStorage",
				Server: { $path: `../../out/game/main.server${extension}` },
				Client: { $path: `../../out/game/ui.client${extension}` },
				Cache: { $path: `../../out/game/..cache/value${extension}` },
				Copied: { $path: "../../out/game/copied.luau" },
				Stale: { $path: "../../out/game/stale.luau" },
				External: { $path: "../../external.luau" },
				Part: { $className: "Part" },
			},
		},
		"game/rojo/custom.project.json",
	);

	const sourceMap = await generate({
		rojo: fixture.file("game/rojo/custom.project.json"),
		"include-non-scripts": true,
	});

	expect(collectPaths(sourceMap).sort()).toEqual([
		"../../external.luau",
		"../src/..cache/value.ts",
		"../src/copied.luau",
		"../src/main.server.ts",
		"../src/ui.client.tsx",
		"custom.project.json",
	]);
	expect(sourceMap.children?.[0].children?.find(child => child.name === "Part")?.className).toBe("Part");
	expect(sourceMap.children?.[0].children?.find(child => child.name === "Stale")?.filePaths).toEqual([]);
});

it("uses inherited rbxts options relative to the declaring config", async () => {
	fs.moveSync(fixture.file("game/default.project.json"), fixture.file("game/custom.project.json"));
	fixture.json("config/options.json", { rbxts: { rojo: "../game/custom.project.json" } });
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.extends = ["../base.json", "../config/options.json"];
	fixture.json("game/tsconfig.json", config);

	const sourceMap = await generate();

	expect(collectPaths(sourceMap)).toEqual(["custom.project.json", "src/index.ts"]);
});

it("writes JSON to stdout when no output file is selected", async () => {
	const write = jest.spyOn(LogService, "writeLine").mockImplementation(() => {});

	await sourcemap.handler({ _: [], $0: "rbxtsc", project: fixture.file("game") });

	expect(write).toHaveBeenCalledTimes(1);
	const sourceMap = JSON.parse(write.mock.calls[0][0] as string) as RojoSourceMap;
	expect(collectPaths(sourceMap)).toEqual(["default.project.json", "src/index.ts"]);
});

it("reports a missing Rojo configuration without falling back to the working directory", async () => {
	fs.removeSync(fixture.file("game/default.project.json"));

	await expect(generate()).rejects.toMatchObject({
		diagnostics: [
			expect.objectContaining({ messageText: expect.stringContaining("Unable to find a Rojo project file") }),
		],
	});
});

it("keeps configuration warnings out of JSON output", async () => {
	fs.moveSync(fixture.file("game/default.project.json"), fixture.file("game/a.project.json"));
	fs.copyFileSync(fixture.file("game/a.project.json"), fixture.file("game/b.project.json"));
	const stdout = jest.spyOn(process.stdout, "write").mockReturnValue(true);
	const stderr = jest.spyOn(process.stderr, "write").mockReturnValue(true);

	await sourcemap.handler({ _: [], $0: "rbxtsc", project: fixture.file("game") });

	const sourceMap = JSON.parse(stdout.mock.calls.map(([chunk]) => chunk).join("")) as RojoSourceMap;
	expect(collectPaths(sourceMap)).toEqual(["a.project.json", "src/index.ts"]);
	expect(stderr.mock.calls.map(([chunk]) => chunk).join("")).toContain("Multiple *.project.json files found");
});

it("preserves Rojo's null sourcemap for a project without scripts", async () => {
	fixture.tree({ $className: "DataModel", Workspace: { $className: "Workspace", Part: { $className: "Part" } } });

	const sourceMap = await generate();

	expect(sourceMap).toBeNull();
});
