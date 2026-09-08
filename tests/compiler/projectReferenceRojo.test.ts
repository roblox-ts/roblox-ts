import fs from "fs-extra";
import { projectPathKey } from "Project/classes/ProjectGraph";
import { LogService } from "Shared/classes/LogService";

import { expectSuccess, ReferenceFixture, startWatch } from "./referenceFixture";

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

it("preserves output when a Rojo config has an invalid tree", () => {
	expectSuccess(fixture.createBuild().build());
	const before = fixture.read("out/game/init.luau");
	fixture.json("default.project.json", { name: "invalid", tree: false });
	const warn = jest.spyOn(LogService, "warn").mockImplementation(() => {});
	try {
		expect(fixture.createBuild().build().emitSkipped).toBe(true);
		expect(fixture.read("out/game/init.luau")).toBe(before);
	} finally {
		warn.mockRestore();
	}
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
	"watches added and removed project files in mapped directories (polling=%s)",
	async usePolling => {
		fs.ensureDirSync(fixture.file("rojo"));
		fixture.rojo({ nested: { $path: "rojo" } });
		const watch = await startWatch(fixture, usePolling);
		try {
			await watch.edit(() => {
				fixture.json("rojo/extra.project.json", {
					name: "extra",
					tree: { current: { $path: "../out/shared" } },
				});
			});
			expect(fixture.read("out/game/init.luau")).toContain('"nested", "extra", "current"');

			await watch.edit(() => fs.removeSync(fixture.file("rojo/extra.project.json")));
			expect(fixture.read("out/game/init.luau")).toContain('"shared"');
			expect(fixture.read("out/game/init.luau")).not.toContain('"extra"');
		} finally {
			await watch.close();
		}
	},
);
