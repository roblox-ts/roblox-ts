import fs from "fs-extra";
import path from "path";
import { ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { formatDiagnostics } from "Shared/util/formatDiagnostics";

import { expectSuccess, ReferenceFixture, startWatch } from "./referenceFixture";

jest.setTimeout(30000);

function diagnosticCodes(action: () => unknown) {
	try {
		action();
		throw new Error("Expected a diagnostic");
	} catch (error) {
		if (!(error instanceof DiagnosticError)) {
			throw error;
		}

		return error.diagnostics.map(diagnostic => diagnostic.code);
	}
}

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

it("builds a reference chain in dependency order and reuses unchanged output", () => {
	fixture.project("common");
	fixture.project("shared", ["common"]);
	fixture.project("game", ["shared"]);
	fixture.write(
		"shared/src/index.ts",
		'import { value } from "../../common/src"; export function answer() { return value + 1; }',
	);
	fixture.write("game/src/index.ts", 'import { answer } from "../../shared/src"; export const result = answer();');

	const build = fixture.createBuild();
	expectSuccess(build.build());

	expect(fixture.read("out/shared/init.luau")).toContain('"common"');
	expect(fixture.read("out/game/init.luau")).toContain('"shared"');
	expect(
		Object.fromEntries(
			["shared", "game"].map(name => [
				name,
				fixture.read(`out/${name}/init.luau`).replace(/^-- Compiled with roblox-ts v[^\n]+\n/, ""),
			]),
		),
	).toMatchSnapshot();
	expect(fs.existsSync(fixture.file("shared/include"))).toBe(false);
	expect(fs.existsSync(fixture.file("include/RuntimeLib.lua"))).toBe(true);
	expect(build.build().emittedFiles).toEqual([]);
});

it("cleans deleted dependency sources on a subsequent build", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write("shared/src/orphan.ts", "export const orphan = 1;");

	const build = fixture.createBuild();
	expectSuccess(build.build());

	fs.removeSync(fixture.file("shared/src/orphan.ts"));

	expectSuccess(build.build());

	expect(fs.existsSync(fixture.file("out/shared/orphan.luau"))).toBe(false);
	expect(fs.existsSync(fixture.file("out/shared/orphan.d.ts"))).toBe(false);
});

it("deduplicates diamond references", () => {
	fixture.project("common");
	fixture.project("left", ["common"]);
	fixture.project("right", ["common"]);
	fixture.project("game", ["left", "right"]);

	const build = fixture.createBuild();

	expect([...build.graph.projects.values()].map(project => path.basename(project.data.projectPath))).toEqual([
		"common",
		"left",
		"right",
		"game",
	]);

	expectSuccess(build.build());
});

it("diagnoses circular references with the TypeScript build diagnostic", () => {
	fixture.project("shared", ["game"]);
	fixture.project("game", ["shared"], { composite: true });

	expect(diagnosticCodes(() => fixture.createBuild())).toContain(6202);
});

it("honors per-project extensions and an explicit CLI override", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
	fixture.json("shared/tsconfig.json", { ...config, rbxts: { luau: false } });
	fixture.write("game/src/index.ts", 'import { value } from "../../shared/src"; export const result = value;');

	expectSuccess(fixture.createBuild().build());

	expect(fs.existsSync(fixture.file("out/shared/init.lua"))).toBe(true);

	expectSuccess(fixture.createBuild({ luau: true }).build());

	expect(fs.existsSync(fixture.file("out/shared/init.luau"))).toBe(true);
	expect(fs.existsSync(fixture.file("out/shared/init.lua"))).toBe(false);
});

it("maps separate declaration directories and index modules to Luau", () => {
	fixture.project("shared", [], { declarationDir: "../declarations/shared", declarationMap: true });
	fixture.project("game", ["shared"]);
	fixture.write("game/src/index.ts", 'import { value } from "../../shared/src"; export const result = value;');

	expectSuccess(fixture.createBuild().build());

	expect(fs.existsSync(fixture.file("declarations/shared/index.d.ts.map"))).toBe(true);
	expect(fixture.read("out/game/init.luau")).toContain('"shared"');
});

it("rejects overlapping output ownership before deleting anything", () => {
	fixture.project("shared", [], { outDir: "../out/game/shared" });
	fixture.project("game", ["shared"]);
	fixture.write("out/game/shared/keep.luau", "return 1");

	expect(() => fixture.createBuild()).toThrow();
	expect(fixture.read("out/game/shared/keep.luau")).toBe("return 1");
});

it("reports a missing reference instead of silently dropping it", () => {
	fixture.project("game", ["missing"]);

	expect(diagnosticCodes(() => fixture.createBuild())).toContain(5083);
});

it("requires composite dependencies", () => {
	fixture.project("shared", [], { composite: false });
	fixture.project("game", ["shared"]);

	expect(diagnosticCodes(() => fixture.createBuild())).toContain(6306);
});

it("restores missing outputs without requiring a source edit", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);

	const build = fixture.createBuild();
	expectSuccess(build.build());

	fs.removeSync(fixture.file("out/shared/init.luau"));
	fs.removeSync(fixture.file("out/shared/index.d.ts"));

	expectSuccess(build.build());

	expect(fs.existsSync(fixture.file("out/shared/init.luau"))).toBe(true);
	expect(fs.existsSync(fixture.file("out/shared/index.d.ts"))).toBe(true);
});

it("supports a solution config with a shared Rojo deployment context", () => {
	fixture.project("shared");
	fixture.project("game");
	fixture.json("game/tsconfig.json", { files: [], references: [{ path: "../shared/tsconfig.json" }] });

	expectSuccess(fixture.createBuild().build());

	expect(fs.existsSync(fixture.file("out/shared/init.luau"))).toBe(true);
});

it.each([false, true])(
	"recovers edits, copied assets, and deletions after a failed watch build (incremental=%s)",
	async incremental => {
		fixture.project("game", [], {
			incremental,
			tsBuildInfoFile: incremental ? "../cache/game.tsbuildinfo" : undefined,
		});
		fixture.write("game/src/other.ts", "export const other = 1;");
		fixture.write("game/src/orphan.ts", "export const orphan = 1;");
		fixture.write("game/src/asset.lua", "return 1");

		const watch = await startWatch(fixture);

		try {
			await watch.edit(() => {
				fixture.write("game/src/index.ts", "export const value = 2;");
				fixture.write("game/src/other.ts", 'export const other: number = "bad";');
				fixture.write("game/src/asset.lua", "return 2");
				fs.removeSync(fixture.file("game/src/orphan.ts"));
			});

			expect(watch.log).toContain("Found 1 error");

			await watch.edit(() => fixture.write("game/src/other.ts", "export const other = 2;"));

			expect(fixture.read("out/game/init.luau")).toContain("value = 2");
			expect(fixture.read("out/game/asset.lua")).toBe("return 2");
			expect(fs.existsSync(fixture.file("out/game/orphan.luau"))).toBe(false);
		} finally {
			await watch.close();
		}
	},
);

it("retains outstanding dependency diagnostics during unrelated watch edits", async () => {
	fixture.project("left");
	fixture.project("right");
	fixture.project("game", ["left", "right"]);

	const watch = await startWatch(fixture);

	try {
		await watch.edit(() => fixture.write("left/src/index.ts", 'export const value: number = "bad";'));
		await watch.edit(() => fixture.write("right/src/index.ts", "export const value = 2;"));

		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 1 error");

		await watch.edit(() => fixture.write("left/src/index.ts", "export const value = 3;"));

		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
	} finally {
		await watch.close();
	}
});

it("uses the composite config directory as the default rootDir", () => {
	fixture.project("shared", [], { rootDir: undefined });
	fixture.project("game", ["shared"]);
	fixture.rojo({ shared: { $path: "out/shared/src" } });
	fixture.write("game/src/index.ts", 'import { value } from "../../shared/src"; export const result = value;');

	expectSuccess(fixture.createBuild().build());

	expect(fs.existsSync(fixture.file("out/shared/src/init.luau"))).toBe(true);
	expect(fs.existsSync(fixture.file("out/shared/src/index.d.ts"))).toBe(true);
});

it("preserves the last good declarations and Luau after an upstream error", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write(
		"game/src/index.ts",
		'import { value } from "../../shared/src"; export const result: number = value;',
	);

	const build = fixture.createBuild();
	expectSuccess(build.build());

	const before = fixture.read("out/shared/init.luau");
	const declaration = fixture.read("out/shared/index.d.ts");

	fixture.write("shared/src/index.ts", 'export const value: number = "bad";');

	expect(build.build().emitSkipped).toBe(true);
	expect(fixture.read("out/shared/init.luau")).toBe(before);
	expect(fixture.read("out/shared/index.d.ts")).toBe(declaration);

	fixture.write("shared/src/index.ts", 'export const value = "new type";');

	expect(build.build().diagnostics.map(diagnostic => diagnostic.code)).toContain(2322);

	fixture.write(
		"game/src/index.ts",
		'import { value } from "../../shared/src"; export const result: string = value;',
	);

	expectSuccess(build.build());
});

it("rebinds plugin output against current referenced declarations", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"], { declaration: true, plugins: [{ transform: "../plugin.cjs" }] });
	fixture.write(
		"plugin.cjs",
		`module.exports = (program, config, { ts }) => context => source => {
		const visit = node => ts.isIdentifier(node) && node.text === "PLACEHOLDER"
			? ts.factory.createNumericLiteral(1) : ts.visitEachChild(node, visit, context);
		return ts.visitNode(source, visit);
	};`,
	);
	fixture.write(
		"game/src/index.ts",
		'import { value } from "../../shared/src"; export const result = value; export const generated = PLACEHOLDER;',
	);

	const build = fixture.createBuild();
	expectSuccess(build.build());

	fixture.write("shared/src/index.ts", 'export const value = "changed";');

	expectSuccess(build.build([fixture.file("shared/src/index.ts")]));

	expect(fixture.read("out/game/index.d.ts")).toContain('result = "changed"');
});

it("maps external JSON and handwritten declarations through Rojo", () => {
	fixture.project("game", [], { resolveJsonModule: true });
	fixture.json("external/config.json", { value: 4 });
	fixture.write("external/helper.luau", "return { value = 5 }");
	fixture.write("external/helper.d.ts", "export declare const value: number;");
	fixture.rojo({ external: { $path: "external" } });
	fixture.write(
		"game/src/index.ts",
		'import config from "../../external/config.json"; import { value } from "../../external/helper"; export const result = config.value + value;',
	);

	expectSuccess(fixture.createBuild().build());

	expect(fixture.read("out/game/init.luau")).toContain('"external", "config"');
	expect(fixture.read("out/game/init.luau")).toContain('"external", "helper"');
});

it("keeps server import restrictions across project references", () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	const rojo = fs.readJsonSync(fixture.file("default.project.json"));
	delete rojo.tree.ReplicatedStorage.shared;
	rojo.tree.ServerStorage = { $className: "ServerStorage", shared: { $path: "out/shared" } };
	fixture.json("default.project.json", rojo);
	fixture.write("game/src/index.ts", 'import { value } from "../../shared/src"; export const result = value;');

	const result = fixture.createBuild().build();

	expect(result.emitSkipped).toBe(true);
	expect(formatDiagnostics(result.diagnostics)).toContain("server");
});

it("watches config changes, new references, and source additions", async () => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);

	const watch = await startWatch(fixture);

	try {
		await watch.edit(() => {
			fixture.write("shared/src/added.ts", "export const added = 2;");
			fixture.write(
				"game/src/index.ts",
				'import { added } from "../../shared/src/added"; export const result = added;',
			);
		});

		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
		expect(fs.existsSync(fixture.file("out/shared/added.luau"))).toBe(true);

		await watch.edit(() => {
			const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
			fixture.json("shared/tsconfig.json", { ...config, rbxts: { luau: false } });
		});

		expect(fs.existsSync(fixture.file("out/shared/added.lua"))).toBe(true);
		expect(fs.existsSync(fixture.file("out/shared/added.luau"))).toBe(false);

		await watch.edit(() => {
			fixture.project("common");
			const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
			fixture.json("shared/tsconfig.json", { ...config, references: [{ path: "../common" }] });
		});

		expect(fs.existsSync(fixture.file("out/common/init.luau"))).toBe(true);

		await watch.edit(() => fixture.write("common/src/index.ts", "export const value = 8;"));

		expect(fixture.read("out/common/init.luau")).toContain("value = 8");
	} finally {
		await watch.close();
	}
});

it("recovers a missing reference introduced while watching", async () => {
	fixture.project("game");

	const watch = await startWatch(fixture);

	try {
		await watch.edit(() => {
			const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
			fixture.json("game/tsconfig.json", { ...config, references: [{ path: "../shared" }] });
		});

		expect(watch.log).toContain("TS5083");

		await watch.edit(() => fixture.project("shared"));

		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
		expect(fs.existsSync(fixture.file("out/shared/init.luau"))).toBe(true);
	} finally {
		await watch.close();
	}
});

it.each(["out/game/include", "out/game"])("preserves runtime files at %s while cleaning stale output", includePath => {
	fixture.project("game");
	fixture.rojo({ include: { $path: includePath } });
	fixture.write("game/src/orphan.ts", "export const orphan = 1;");

	const build = fixture.createBuild({ includePath: fixture.file(includePath) });
	expectSuccess(build.build());

	expect(fs.existsSync(fixture.file(`${includePath}/RuntimeLib.lua`))).toBe(true);

	fs.removeSync(fixture.file("game/src/orphan.ts"));

	expectSuccess(build.build());

	expect(fs.existsSync(fixture.file(`${includePath}/RuntimeLib.lua`))).toBe(true);
	expect(fs.existsSync(fixture.file("out/game/orphan.luau"))).toBe(false);
});

it("rebuilds shared output when switching between game deployment contexts", () => {
	fixture.project("common");
	fixture.project("shared", ["common"]);
	fixture.project("game", ["shared"]);
	fixture.project("game2", ["shared"]);
	fixture.write("shared/src/index.ts", 'import { value } from "../../common/src"; export const result = value;');

	const deploy = (name: string, root: string) => {
		fixture.json(`${name}.project.json`, {
			name,
			tree: {
				$className: "DataModel",
				ReplicatedStorage: {
					$className: "ReplicatedStorage",
					[name]: {
						include: { $path: `include/${name}` },
						common: { $path: "out/common" },
						shared: { $path: "out/shared" },
						game: { $path: `out/${root}` },
					},
				},
			},
		});

		const build = fixture.createBuild(
			{ rojo: fixture.file(`${name}.project.json`), includePath: fixture.file(`include/${name}`) },
			root,
		);
		expectSuccess(build.build());

		return fixture.read("out/shared/init.luau");
	};

	const first = deploy("first", "game");
	const second = deploy("second", "game2");

	expect(first).toContain('"first", "common"');
	expect(second).toContain('"second", "common"');
	expect(second).not.toBe(first);
	expect(deploy("first", "game")).toBe(first);
});

it.each([ProjectType.Model, ProjectType.Package])("builds references inside a %s Rojo tree", type => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write("game/src/index.ts", 'import { value } from "../../shared/src"; export const result = value;');
	fixture.json("package.json", {
		name: type === ProjectType.Package ? "@rbxts/reference-fixture" : "reference-fixture",
	});
	fixture.json("default.project.json", {
		name: "references",
		tree: {
			$className: "Folder",
			include: { $path: "include" },
			shared: { $path: "out/shared" },
			game: { $path: "out/game" },
		},
	});

	expectSuccess(fixture.createBuild({ type }).build());

	expect(fixture.read("out/game/init.luau")).toContain('TS.import(script, script.Parent, "shared")');
	expect(fs.existsSync(fixture.file("out/shared/index.d.ts"))).toBe(true);
});

it.each([false, true])("watches atomic source and config replacements (polling=%s)", async polling => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.write("game/src/index.ts", 'import { value } from "../../shared/src"; export const result = value;');

	const watch = await startWatch(fixture, polling);
	const replace = (relative: string, text: string) => {
		fixture.write(`${relative}.tmp`, text);
		fs.renameSync(fixture.file(`${relative}.tmp`), fixture.file(relative));
	};

	try {
		await watch.edit(() => replace("shared/src/index.ts", "export const value = 12;"));

		expect(fixture.read("out/shared/init.luau")).toContain("value = 12");

		await watch.edit(() => {
			const config = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
			replace("shared/tsconfig.json", JSON.stringify({ ...config, rbxts: { luau: false } }));
		});

		expect(fs.existsSync(fixture.file("out/shared/init.lua"))).toBe(true);
		expect(fs.existsSync(fixture.file("out/shared/init.luau"))).toBe(false);
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
	} finally {
		await watch.close();
	}
});

it.each([false, true])("detaches removed references and watches restored references (polling=%s)", async polling => {
	fixture.project("shared");
	fixture.project("game", ["shared"]);
	fixture.json("shared/base.json", { extends: "../base.json" });
	const sharedConfig = fs.readJsonSync(fixture.file("shared/tsconfig.json"));
	fixture.json("shared/tsconfig.json", { ...sharedConfig, extends: "./base.json" });
	const gameConfig = fs.readJsonSync(fixture.file("game/tsconfig.json"));

	const watch = await startWatch(fixture, polling);
	try {
		await watch.edit(() => fixture.json("game/tsconfig.json", { ...gameConfig, references: [] }));
		await watch.expectNoBuild(() => {
			fixture.write("shared/src/index.ts", "export const value = 2;");
			fixture.json("shared/base.json", { extends: "../base.json", compilerOptions: { strict: true } });
			fixture.write("shared/tsconfig.json", fixture.read("shared/tsconfig.json") + "\n");
		});

		await watch.edit(() => fixture.json("game/tsconfig.json", gameConfig));
		expect(fixture.read("out/shared/init.luau")).toContain("value = 2");

		await watch.edit(() => fixture.write("shared/src/added.ts", "export const added = 3;"));
		await watch.edit(() => fs.removeSync(fixture.file("shared/src/added.ts")));
		expect(fs.existsSync(fixture.file("out/shared/added.luau"))).toBe(false);

		await watch.edit(() => fixture.write("shared/src/added.ts", "export const added = 4;"));
		expect(fixture.read("out/shared/added.luau")).toContain("added = 4");
	} finally {
		await watch.close();
	}
});

it.each([false, true])("catches source generation while registering a new reference (polling=%s)", async polling => {
	fixture.project("shared", [], { plugins: [{ transform: "../generate.cjs" }] });
	fixture.project("game");
	fixture.write(
		"generate.cjs",
		`const fs = require("fs");
module.exports = () => () => source => {
	if (source.text === "export const value = 1;") {
		fs.writeFileSync(source.fileName, "export const value = 2;");
	}
	return source;
};`,
	);
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	const watch = await startWatch(fixture, polling);

	try {
		// code generation changes the input after it was read, before the new project's watcher is registered
		await watch.edit(() => fixture.json("game/tsconfig.json", { ...config, references: [{ path: "../shared" }] }));
		expect(fixture.read("shared/src/index.ts")).toBe("export const value = 2;");
		expect(fixture.read("out/shared/init.luau")).toContain("value = 2");
	} finally {
		await watch.close();
	}
});
