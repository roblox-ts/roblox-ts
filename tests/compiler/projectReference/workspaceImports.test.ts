import fs from "fs-extra";
import path from "path";

import { expectSuccess, ReferenceFixture } from "../referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture({ rojo: undefined, includePath: undefined });
});
afterEach(() => fixture.close());

it.each([
	["package", false, false],
	["package", true, false],
	["package", true, true],
	["game", false, false],
	["game", true, false],
	["game", true, true],
	["mounted-game", false, false],
])("resolves a workspace reference for %s (main=%s, subpath=%s)", (consumer, main, subpath) => {
	fixture.project("lib", [], { outDir: "out", declarationDir: "types" });
	fixture.json("lib/package.json", {
		name: "@rbxts/lib",
		version: "1.0.0",
		types: "types/index.d.ts",
		...(main ? { main: "out/init.luau" } : {}),
	});
	const libConfig = fs.readJsonSync(fixture.file("lib/tsconfig.json"));
	libConfig.rbxts = { type: "package" };
	fixture.json("lib/tsconfig.json", libConfig);
	fixture.write("lib/src/sub.ts", "export const value = 7;");
	fs.ensureSymlinkSync(fixture.file("lib"), fixture.file("node_modules/@rbxts/lib"), "junction");

	fixture.project("game", ["lib"]);
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.rbxts = {
		type: consumer === "package" ? "package" : "game",
		rojo: "../default.project.json",
		includePath: "../include",
	};
	fixture.json("game/tsconfig.json", config);
	fixture.write(
		"game/src/index.ts",
		`import { value } from "@rbxts/lib${subpath ? "/types/sub" : ""}"; export const result = value;`,
	);
	fixture.rojo(
		consumer === "mounted-game"
			? { node_modules: { "@rbxts": { lib: { $path: "node_modules/@rbxts/lib/out" } } } }
			: { lib: { $path: "lib/out" } },
	);

	expectSuccess(fixture.createBuild().build());

	const output = fixture.read("out/game/init.luau");
	if (consumer === "package") {
		expect(output).toContain(`TS.getModule(script, "@rbxts", "lib").out${subpath ? ".sub" : ""}`);
	} else if (consumer === "mounted-game") {
		expect(output).toContain('"node_modules", "@rbxts", "lib"');
	} else {
		expect(output).toContain(`"lib"${subpath ? ', "sub"' : ""}`);
	}
	expect(output).not.toContain('"types"');
});

it("reports an unmapped reference output without a workspace symlink", () => {
	fixture.project("lib", [], { outDir: "out" });
	const libConfig = fs.readJsonSync(fixture.file("lib/tsconfig.json"));
	libConfig.rbxts = { type: "package" };
	fixture.json("lib/tsconfig.json", libConfig);
	fixture.project("game", ["lib"]);
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.rbxts = { type: "game", rojo: "../default.project.json", includePath: "../include" };
	fixture.json("game/tsconfig.json", config);
	fixture.write("game/src/index.ts", 'import { value } from "../../lib/src"; export const result = value;');

	const result = fixture.createBuild().build();

	expect(result.emitSkipped).toBe(true);
	expect(result.diagnostics.map(diagnostic => diagnostic.messageText).join("\n")).toContain(
		path.join("lib", "out", "init.luau"),
	);
});
