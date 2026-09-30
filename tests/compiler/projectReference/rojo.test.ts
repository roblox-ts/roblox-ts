import fs from "fs-extra";
import path from "path";
import { projectPathKey } from "Project/classes/ProjectGraph";
import { LogService } from "Shared/classes/LogService";

import { expectSuccess, ReferenceFixture, startWatch } from "../referenceFixture";

jest.setTimeout(30000);

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write("game/src/index.ts", 'import { value } from "../../shared/src"; export const result = value;');
});
afterEach(() => fixture.close());

it("preserves filename casing when copying project assets", () => {
	fixture.json("shared/src/MixedCase.project.json", { name: "nested", tree: {} });

	expectSuccess(fixture.createBuild().build());

	expect(fs.readdirSync(fixture.file("out/shared"))).toContain("MixedCase.project.json");
});

it("does not treat a JSON module with an empty project name as a project config", () => {
	fixture.json("assets/.project.json", { value: 1 });
	fixture.rojo({ assets: { $path: "assets" } });
	expectSuccess(fixture.createBuild({ writeOnlyChanged: false }).build());

	fixture.json("assets/.project.json", { value: 2 });
	const result = fixture.createBuild({ writeOnlyChanged: false }).build();

	expectSuccess(result);
	expect(result.emittedFiles).toEqual([]);
});

it("watches a selected config with a custom filename inside a mapped directory", async () => {
	fs.ensureDirSync(fixture.file("rojo"));
	fixture.rojo({ extra: { $path: "rojo" } });
	const watch = await startWatch(fixture);
	try {
		await watch.edit(() => {
			fixture.write("rojo/custom.json", "{");
			const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
			config.rbxts = { rojo: "../rojo/custom.json" };
			fixture.json("shared/tsconfig.json", config);
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 1 error");

		await watch.edit(() => {
			const config = fs.readJsonSync(fixture.file("default.project.json"));
			for (const name of ["include", "shared", "game", "extra"]) {
				config.tree.ReplicatedStorage[name].$path = `../${config.tree.ReplicatedStorage[name].$path}`;
			}
			fixture.json("rojo/custom.json", config);
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
	} finally {
		await watch.close();
	}
});

it("closes while a selected Rojo file is still missing", async () => {
	const watch = await startWatch(fixture);
	try {
		await watch.edit(() => {
			const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
			config.rbxts = { rojo: "../pending/owner.project.json" };
			fixture.json("shared/tsconfig.json", config);
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 1 error");
	} finally {
		await watch.close();
	}
});

it("discovers project files through optional directory paths and junctions", () => {
	fixture.json("rojo/default.project.json", {
		name: "nested",
		tree: { current: { $path: "../../out/shared" } },
	});
	fs.ensureSymlinkSync(fixture.file("rojo"), fixture.file("container/link"), "junction");
	fixture.rojo({ shared: { $path: { optional: "container" } } });
	const build = fixture.createBuild();

	expectSuccess(build.build());
	expect(fixture.read("out/game/init.luau")).toContain('"nested", "current"');
	expect(build.getWatchPaths().map(projectPathKey)).toContain(
		projectPathKey(fixture.file("container/link/default.project.json")),
	);
});

it.each([false, true])("recovers when a newly selected child Rojo file is created (polling=%s)", async usePolling => {
	const watch = await startWatch(fixture, usePolling);
	try {
		await watch.edit(() => {
			const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
			config.rbxts = { rojo: "../new-owner/nested/owner.json" };
			fixture.json("shared/tsconfig.json", config);
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 1 error");

		await watch.edit(() => {
			const config = fs.readJsonSync(fixture.file("default.project.json"));
			config.tree.ReplicatedStorage.include.$path = "../../include";
			config.tree.ReplicatedStorage.shared.$path = "../../out/shared";
			config.tree.ReplicatedStorage.game.$path = "../../out/game";
			fixture.json("new-owner/nested/owner.json", config);
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
	} finally {
		await watch.close();
	}
});

it("loads nested project files copied by a dependency before compiling its consumer", () => {
	fixture.json("shared/src/default.project.json", {
		name: "nested",
		tree: { current: { $path: "init.luau" } },
	});
	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/init.luau")).toContain('"shared", "current"');

	fixture.json("shared/src/default.project.json", {
		name: "nested",
		tree: { changed: { $path: "init.luau" } },
	});
	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/init.luau")).toContain('"shared", "changed"');
});

function nestedRojo(name: string) {
	fixture.json("rojo/default.project.json", {
		name: "nested",
		tree: { [name]: { $path: "../out/shared" } },
	});
	fixture.rojo({ shared: { $path: "rojo" } });
}

it("invalidates the disk cache when a nested Rojo config changes", () => {
	nestedRojo("before");
	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/init.luau")).toContain('"shared", "before"');

	nestedRojo("after");
	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/init.luau")).toContain('"shared", "after"');
});

it.each([false, true])("watches nested Rojo changes and repairs invalid JSON (polling=%s)", async usePolling => {
	nestedRojo("before");
	const watch = await startWatch(fixture, usePolling);
	try {
		await watch.edit(() => {
			fixture.json("rojo/default.project.json", {
				name: "nested",
				tree: { after: { $path: "../out/shared" } },
			});
		});
		expect(fixture.read("out/game/init.luau")).toContain('"shared", "after"');

		const output = fixture.read("out/game/init.luau");
		await watch.edit(() => fixture.write("rojo/default.project.json", "{"));
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 1 error");
		expect(fixture.read("out/game/init.luau")).toBe(output);

		await watch.edit(() => nestedRojo("repaired"));
		expect(fixture.read("out/game/init.luau")).toContain('"shared", "repaired"');
	} finally {
		await watch.close();
	}
});

it.each([false, true])(
	"watches project files inside newly created mapped subdirectories (polling=%s)",
	async usePolling => {
		fs.ensureDirSync(fixture.file("rojo"));
		fixture.rojo({ nested: { $path: "rojo" } });
		const watch = await startWatch(fixture, usePolling);
		try {
			await watch.edit(() => {
				fixture.json("rojo/new/extra.project.json", {
					name: "extra",
					tree: { current: { $path: "../../out/shared" } },
				});
			});
			expect(fixture.read("out/game/init.luau")).toContain('"nested", "new", "extra", "current"');

			await watch.edit(() => fs.removeSync(fixture.file("rojo/new")));
			expect(fixture.read("out/game/init.luau")).toContain('"shared"');
			expect(fixture.read("out/game/init.luau")).not.toContain('"extra"');
		} finally {
			await watch.close();
		}
	},
);

it.each([null, { name: "invalid", tree: false }, { name: "invalid", tree: { $path: null } }])(
	"preserves output when a Rojo project has no usable tree: %j",
	config => {
		expectSuccess(fixture.createBuild().build());
		const before = fixture.read("out/game/init.luau");
		fixture.json("default.project.json", config);
		const warn = jest.spyOn(LogService, "warn").mockImplementation(() => {});
		try {
			expect(fixture.createBuild().build().emitSkipped).toBe(true);
			expect(fixture.read("out/game/init.luau")).toBe(before);
		} finally {
			warn.mockRestore();
		}
	},
);

it("reports an invalid optional Rojo path", () => {
	fixture.json("default.project.json", { name: "invalid", tree: { $path: {} } });

	expect(() => fixture.createBuild()).toThrow("Unable to read Rojo project");
});

it("reports a recursive Rojo project without replacing output", () => {
	expectSuccess(fixture.createBuild().build());
	const before = fixture.read("out/game/init.luau");
	fixture.rojo({ recursive: { $path: "." } });

	expect(() => fixture.createBuild()).toThrow("Unable to read Rojo project");
	expect(fixture.read("out/game/init.luau")).toBe(before);
});

it("refreshes consumer mounts after a package without Rojo copies a nested project", () => {
	fixture.json("package.json", { name: "@rbxts/reference-fixture", version: "1.0.0" });
	for (const [name, rojo] of [
		["game", "../default.project.json"],
		["shared", ""],
	]) {
		const config = fs.readJsonSync(fixture.file(`${name}/tsconfig.json`));
		fixture.json(`${name}/tsconfig.json`, { ...config, rbxts: { rojo } });
	}
	fixture.json("shared/src/default.project.json", { name: "nested", tree: { current: { $path: "init.luau" } } });
	const build = fixture.createBuild({ rojo: undefined });

	expectSuccess(build.build());
	expect(fixture.read("out/game/init.luau")).toContain('"shared", "current"');
});

it("validates imported source files that are not root inputs on every build", () => {
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	config.include = ["src/index.ts"];
	fixture.json("game/tsconfig.json", config);
	fixture.write("game/src/index.ts", 'import { value } from "./helpers/value"; export const result = value;');
	fixture.write("game/src/helpers/value.ts", "export const value = 42;");
	fixture.rojo({ invalid: { $path: "game/src/helpers" } });
	const build = fixture.createBuild();

	for (let i = 0; i < 2; i++) {
		const result = build.build();
		expect(result.emitSkipped).toBe(true);
		expect(result.diagnostics.map(diagnostic => diagnostic.messageText).join("\n")).toContain(
			`$path from "${path.join("game", "src", "helpers")}" to "${path.join("out", "game", "helpers")}"`,
		);
	}
});

it("tracks directly mounted project files and invalidates cached imports", () => {
	fixture.json("rojo/library.project.json", { name: "unused", tree: { before: { $path: "../out/shared" } } });
	fixture.rojo({ shared: { $path: "rojo/library.project.json" } });
	const build = fixture.createBuild();

	expectSuccess(build.build());
	expect(fixture.read("out/game/init.luau")).toContain('"shared", "before"');
	expect(build.isConfigPath(fixture.file("rojo/library.project.json"))).toBe(true);

	fixture.json("rojo/library.project.json", { name: "unused", tree: { after: { $path: "../out/shared" } } });
	expectSuccess(fixture.createBuild().build());
	expect(fixture.read("out/game/init.luau")).toContain('"shared", "after"');
});

it.each([false, true])(
	"watches creation, deletion, and recreation of optional project files (polling=%s)",
	async usePolling => {
		const nested = "generated/deep/library.project.json";
		fixture.rojo({ extra: { $path: { optional: nested } } });
		const build = fixture.createBuild();
		expect(build.isConfigPath(fixture.file(nested))).toBe(true);
		expect(build.getWatchPaths()).toContain(fixture.file(nested));
		build.close();

		const watch = await startWatch(fixture, usePolling);
		try {
			const create = (name: string) =>
				fixture.json(nested, { name: "unused", tree: { [name]: { $path: "../../out/shared" } } });
			await watch.edit(() => create("first"));
			expect(fixture.read("out/game/init.luau")).toContain('"extra", "first"');

			await watch.edit(() => fs.removeSync(fixture.file(nested)));
			expect(fixture.read("out/game/init.luau")).not.toContain('"extra"');

			await watch.edit(() => create("second"));
			expect(fixture.read("out/game/init.luau")).toContain('"extra", "second"');
		} finally {
			await watch.close();
		}
	},
);

it("keeps an explicitly mounted .project.json file as an ordinary JSON module", () => {
	fixture.json("assets/.project.json", { value: 1 });
	fixture.rojo({ data: { $path: "assets/.project.json" } });
	const build = fixture.createBuild();

	expectSuccess(build.build());
	expect(build.isConfigPath(fixture.file("assets/.project.json"))).toBe(false);
});

it.each([false, true])("recovers after repairing a newly referenced nested project (polling=%s)", async usePolling => {
	const watch = await startWatch(fixture, usePolling);
	try {
		await watch.edit(() => {
			fixture.write("configs/new/library.project.json", "{");
			fixture.rojo({ shared: { $path: "configs/new/library.project.json" } });
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 1 error");

		await watch.edit(() => {
			fixture.json("configs/new/library.project.json", {
				name: "unused",
				tree: { repaired: { $path: "../../out/shared" } },
			});
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
		expect(fixture.read("out/game/init.luau")).toContain('"shared", "repaired"');
	} finally {
		await watch.close();
	}
});
