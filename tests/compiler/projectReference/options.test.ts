import fs from "fs-extra";
import path from "path";
import { ProjectBuild } from "Project/classes/ProjectBuild";
import { readProjectOptions } from "Project/functions/readProjectOptions";
import { LogService } from "Shared/classes/LogService";

import { expectSuccess, ReferenceFixture } from "../referenceFixture";

jest.setTimeout(30000);

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

it("excludes external ambient declarations from owned runtime mount validation", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write("external/types.d.ts", "interface AmbientValue { value: number; }");
	fixture.write("shared/src/index.ts", "export const value: AmbientValue = { value: 1 };");
	fixture.json("owner.project.json", fs.readJsonSync(fixture.file("default.project.json")));
	const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
	config.include.push("../external/types.d.ts");
	config.rbxts = { rojo: "../owner.project.json" };
	fixture.json("shared/tsconfig.json", config);
	const gameConfig = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	gameConfig.include.push("../external/types.d.ts");
	fixture.json("game/tsconfig.json", gameConfig);
	fixture.write("game/src/index.ts", 'import { value } from "../../shared/src"; export const result = value.value;');
	fixture.rojo({ external: { $path: "external" } });

	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/init.luau")).toContain('"shared"');
});

it.each([
	[null, "expected an object"],
	[{ luau: "false" }, '"luau" must be a boolean'],
	[{ rojo: true }, '"rojo" must be a string'],
	[{ type: "place" }, '"type" must be'],
])("rejects invalid rbxts settings %j", (rbxts, message) => {
	fixture.project("game");
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", { ...config, rbxts });

	expect(() => fixture.createBuild()).toThrow(String(message));
});

it("resolves package extends and keeps CLI paths relative to the invocation directory", () => {
	fixture.project("game");
	fixture.json("node_modules/@config/base/package.json", { name: "@config/base", tsconfig: "settings.json" });
	fixture.json("node_modules/@config/base/settings.json", {
		extends: "../../../base.json",
		rbxts: { luau: false, rojo: "../../../default.project.json", includePath: "../../../include" },
	});
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", { ...config, extends: "@config/base" });
	const build = fixture.createBuild({
		rojo: path.relative(process.cwd(), fixture.file("default.project.json")),
		includePath: path.relative(process.cwd(), fixture.file("include")),
	});

	expectSuccess(build.build());
	expect(fs.existsSync(fixture.file("out/game/init.lua"))).toBe(true);
	expect(build.graph.root.data.rojoConfigPath).toBe(fixture.file("default.project.json"));
});

it("keeps an explicitly owned Rojo context stable across consumers", () => {
	fixture.project("common");
	fixture.project("shared", ["common"]);
	fixture.project("game", ["shared"]);
	fixture.project("game2", ["shared"]);
	fixture.write("shared/src/index.ts", 'import { value } from "../../common/src"; export const result = value;');
	const rojo = fs.readJsonSync(fixture.file("default.project.json"));
	fixture.json("owner.project.json", rojo);
	fixture.json("second.project.json", { ...rojo, name: "second" });
	for (const name of ["common", "shared"]) {
		const config = fs.readJsonSync(fixture.file(`${name}/tsconfig.json`));
		config.rbxts = { rojo: "../owner.project.json" };
		fixture.json(`${name}/tsconfig.json`, config);
	}

	expectSuccess(fixture.createBuild({ writeOnlyChanged: false }).build());
	const before = fixture.read("out/shared/init.luau");
	const next = fixture.createBuild({ rojo: fixture.file("second.project.json"), writeOnlyChanged: false }, "game2");
	const result = next.build();
	expectSuccess(result);
	expect(result.emittedFiles).not.toContain(fixture.file("out/shared/init.luau"));
	expect(fixture.read("out/shared/init.luau")).toBe(before);
});

it("rejects incompatible consumer mounts for an owned Rojo context", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write("shared/src/index.ts", "export const value = new Map<string, number>();");
	fixture.json("owner.project.json", fs.readJsonSync(fixture.file("default.project.json")));
	const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
	config.rbxts = { rojo: "../owner.project.json" };
	fixture.json("shared/tsconfig.json", config);
	const rojo = fs.readJsonSync(fixture.file("default.project.json"));
	rojo.tree.ReplicatedStorage.shared = { $path: "elsewhere" };
	rojo.tree.ReplicatedStorage.moved = { $path: "out/shared" };
	fixture.json("default.project.json", rojo);

	expect(() => fixture.createBuild()).toThrow("same Roblox path");
	expect(fs.existsSync(fixture.file("out/shared/init.luau"))).toBe(false);
});

it("inherits rbxts options in multiple-extends order including repeated ancestors", () => {
	fixture.project("game");
	const base = fs.readJsonSync(fixture.file("base.json"));
	base.rbxts = { luau: false, optimizedLoops: false, type: "game" };
	fixture.json("base.json", base);
	fixture.json("left.json", { extends: "./base.json", rbxts: { luau: true } });
	fixture.json("right.json", { extends: "./base.json" });
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.extends = ["../left", "../right"];
	fixture.json("game/tsconfig.json", config);

	const build = fixture.createBuild();
	expectSuccess(build.build());

	expect(build.graph.root.data.projectOptions.optimizedLoops).toBe(false);
	expect(fs.existsSync(fixture.file("out/game/init.lua"))).toBe(true);
	expect(fs.existsSync(fixture.file("out/game/init.luau"))).toBe(false);

	expectSuccess(fixture.createBuild({ luau: true }).build());
	expect(fs.existsSync(fixture.file("out/game/init.luau"))).toBe(true);
});

it("resolves inherited rbxts paths relative to the config that declares them", () => {
	fixture.project("game");
	fixture.json("configs/shared.json", {
		extends: "../base.json",
		rbxts: { rojo: "../default.project.json", includePath: "../include" },
	});
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.extends = "../configs/shared.json";
	fixture.json("game/tsconfig.json", config);
	const build = new ProjectBuild(fixture.file("game/tsconfig.json"));
	try {
		expectSuccess(build.build());
		expect(build.graph.root.data.rojoConfigPath).toBe(fixture.file("default.project.json"));
		expect(build.graph.root.data.projectOptions.includePath).toBe(fixture.file("include"));
	} finally {
		build.close();
	}
});

it("resolves rbxts paths relative to their tsconfig when invoked from another directory", () => {
	fixture.project("game");
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.rbxts = { rojo: "../default.project.json", includePath: "../include" };
	fixture.json("game/tsconfig.json", config);
	const build = new ProjectBuild(fixture.file("game/tsconfig.json"));
	try {
		expectSuccess(build.build());
		expect(build.graph.root.data.rojoConfigPath).toBe(fixture.file("default.project.json"));
		expect(build.graph.root.data.projectOptions.includePath).toBe(fixture.file("include"));
	} finally {
		build.close();
	}
});

it("warns about unknown and CLI-only rbxts options without applying them", () => {
	fixture.project("game");
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.rbxts = { rojoPath: "ignored.project.json", project: "elsewhere", watch: true, verbose: true };
	fixture.json("game/tsconfig.json", config);
	const warn = jest.spyOn(LogService, "warn").mockImplementation(() => {});
	try {
		const build = fixture.createBuild();
		expectSuccess(build.build());
		expect(warn.mock.calls.flat().join("\n")).toContain("rojoPath");
		expect(warn.mock.calls.flat().join("\n")).toContain("watch");
		expect(build.graph.root.data.projectOptions.watch).toBe(false);
		expect(build.graph.root.data.projectOptions.verbose).toBe(false);
		expect(build.graph.root.data.projectOptions).not.toHaveProperty("rojoPath");
	} finally {
		warn.mockRestore();
	}
});

it.each(["./missing.json", "@config/missing"])("reports unresolved inherited rbxts options from %s", extended => {
	fixture.json("options.json", { extends: extended });

	expect(() => readProjectOptions(fixture.file("options.json"), { extends: extended })).toThrow("not found");
});

it("reports malformed inherited rbxts configuration", () => {
	fixture.write("broken.json", "{");

	expect(() => readProjectOptions(fixture.file("options.json"), { extends: "./broken.json" })).toThrow();
});

it("preserves empty inherited paths for default discovery", () => {
	fixture.project("game");
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	fixture.json("game/tsconfig.json", { ...config, rbxts: { rojo: "", includePath: "" } });
	const rojo = fs.readJsonSync(fixture.file("default.project.json"));
	rojo.tree.ReplicatedStorage.game.$path = "../out/game";
	fixture.json("game/default.project.json", rojo);
	const build = fixture.createBuild({ rojo: undefined, includePath: undefined });

	expectSuccess(build.build());
	expect(build.graph.root.data.rojoConfigPath).toBe(fixture.file("game/default.project.json"));
	expect(build.graph.root.data.projectOptions.includePath).toBe(fixture.file("game/include"));
});

it("reports an unmapped module in a reference's owned Rojo context", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	const owner = fs.readJsonSync(fixture.file("default.project.json"));
	delete owner.tree.ReplicatedStorage.shared;
	fixture.json("owner.project.json", owner);
	const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
	fixture.json("shared/tsconfig.json", { ...config, rbxts: { rojo: "../owner.project.json" } });

	expect(() => fixture.createBuild()).toThrow("(unmapped)");
});

it("rejects a consumer without the reference's owned Rojo mounts", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
	fixture.json("shared/tsconfig.json", { ...config, rbxts: { rojo: "../owner.json" } });
	fs.renameSync(fixture.file("default.project.json"), fixture.file("owner.json"));

	expect(() => fixture.createBuild({ rojo: undefined })).toThrow("same Roblox path");
});

it("builds and classifies watch paths without a Rojo project", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.json("package.json", { name: "@rbxts/reference-fixture", version: "1.0.0" });
	fs.removeSync(fixture.file("default.project.json"));
	const build = fixture.createBuild({ rojo: undefined });

	expectSuccess(build.build());
	expect(build.isConfigPath(fixture.file("unrelated.json"))).toBe(false);
	expect(build.isRojoConfigDirectory(fixture.directory)).toBe(false);
	expect(fixture.read("out/game/init.luau")).toContain("value = 1");
});
