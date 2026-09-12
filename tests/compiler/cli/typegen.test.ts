import typegen from "CLI/commands/typegen";
import fs from "fs-extra";
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
	await typegen.handler({ _: [], $0: "rbxtsc", project: fixture.file("game"), ...options });
	return fixture.read("game/src/services.d.ts");
}

it("augments Terrain without redeclaring Workspace.Terrain", async () => {
	fixture.tree({
		$className: "DataModel",
		Workspace: {
			$className: "Workspace",
			Terrain: {
				$className: "Terrain",
				Attachment: { $className: "Attachment", Child: { $className: "Folder" } },
			},
			Spawn: { $className: "SpawnLocation" },
		},
	});
	const before = fixture.diagnostics();

	const output = await generate();
	fixture.write(
		"game/src/access.ts",
		`
		const attachment = game.GetService("Workspace").Terrain.Attachment;
		const child: Folder = attachment.Child;
		const spawn: SpawnLocation = game.GetService("Workspace").Spawn;
	`,
	);

	expect(output).toMatchSnapshot();
	expect(fixture.diagnostics()).toEqual(before);
});

it("escapes quoted property names while preserving their exact values", async () => {
	const names = ['Say "hello"', "path\\node", "line\nbreak", "carriage\rreturn", "space name", "validName"];
	fixture.tree({
		$className: "DataModel",
		ReplicatedStorage: {
			$className: "ReplicatedStorage",
			...Object.fromEntries(names.map(name => [name, { $className: "Folder" }])),
		},
	});
	const before = fixture.diagnostics();

	const output = await generate();
	fixture.write(
		"game/src/access.ts",
		names
			.map(
				(name, index) =>
					`const child${index}: Folder = game.GetService("ReplicatedStorage")[${JSON.stringify(name)}];`,
			)
			.join("\n"),
	);

	expect(output).toMatchSnapshot();
	expect(fixture.diagnostics()).toEqual(before);
});

it("excludes cloned containers, node_modules, and duplicate child names", async () => {
	fixture.json("children.model.json", {
		ClassName: "Folder",
		Children: [
			{ Name: "Same", ClassName: "Folder" },
			{ Name: "Same", ClassName: "Folder" },
			{ Name: "node_modules", ClassName: "Folder" },
		],
	});
	fixture.tree({
		$className: "DataModel",
		ReplicatedStorage: { $className: "ReplicatedStorage", Children: { $path: "../children.model.json" } },
		StarterPlayer: { $className: "StarterPlayer", StarterPlayerScripts: { $className: "StarterPlayerScripts" } },
		PluginDebugService: { $className: "PluginDebugService", Plugin: { $className: "Folder" } },
		ServerStorage: { $className: "ServerStorage" },
	});

	const output = await generate();

	expect(output).toMatchSnapshot();
	expect(output.match(/Same:/g)).toHaveLength(1);
	expect(output).not.toMatch(/StarterPlayer|PluginDebugService|node_modules|ServerStorage/);
});

it("keeps a childless Terrain's existing declaration", async () => {
	fixture.tree({
		$className: "DataModel",
		Workspace: { $className: "Workspace", Terrain: { $className: "Terrain" } },
	});
	const before = fixture.diagnostics();

	const output = await generate();

	expect(output).toMatchSnapshot();
	expect(fixture.diagnostics()).toEqual(before);
});

it("registers flags on the supplied command parser", () => {
	const option = jest.fn().mockReturnThis();
	if (typeof typegen.builder !== "function") {
		throw new Error("Expected a command builder");
	}

	typegen.builder({ option } as unknown as yargs.Argv);

	expect(option.mock.calls.map(([name]) => name)).toEqual(["project", "rojo"]);
});

it("uses the service class name when the service is renamed", async () => {
	fixture.tree({
		$className: "DataModel",
		World: { $className: "Workspace", Spawn: { $className: "SpawnLocation" } },
	});

	const output = await generate();

	expect(output).toContain("interface Workspace");
	expect(output).not.toContain("interface World");
});

it("uses rbxts.rojo from the project configuration", async () => {
	fs.moveSync(fixture.file("game/default.project.json"), fixture.file("game/custom.project.json"));
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.rbxts = { rojo: "custom.project.json" };
	fixture.json("game/tsconfig.json", config);

	const output = await generate();

	expect(output).toContain("Main: ModuleScript;");
});

it.each([{}, { Workspace: { $className: "Workspace" } }])(
	"writes an empty declaration file when no service has children: %j",
	async services => {
		fixture.tree({ $className: "DataModel", ...services });
		fixture.write("game/src/services.d.ts", "interface ReplicatedStorage { Stale: Folder; }");

		const output = await generate();

		expect(output).toBe("");
	},
);
