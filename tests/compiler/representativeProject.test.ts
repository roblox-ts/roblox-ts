import { execFileSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { ProjectBuild } from "Project/classes/ProjectBuild";
import { PACKAGE_ROOT } from "Shared/constants";
import ts from "typescript";

import { expectSuccess, ReferenceFixture, startWatch } from "./referenceFixture";
import {
	CONTENT_COUNT,
	copyRepresentativeSources,
	createRepresentativeProject,
	readRepresentativeOutputs,
} from "./representativeProject";

jest.setTimeout(120000);

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

function diagnostics(result: ts.EmitResult, root: string) {
	return result.diagnostics.map(diagnostic => ({
		code: diagnostic.code,
		file: diagnostic.file && path.relative(root, diagnostic.file.fileName),
		start: diagnostic.start,
		length: diagnostic.length,
		message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n").split(root).join("<project>"),
	}));
}

function expectCleanEquivalent(result?: ts.EmitResult) {
	const clean = new ReferenceFixture();
	try {
		copyRepresentativeSources(fixture, clean);
		const cleanResult = clean.createBuild().build();
		if (result) {
			expect(diagnostics(result, fixture.directory)).toEqual(diagnostics(cleanResult, clean.directory));
		}
		expectSuccess(cleanResult);
		expect(readRepresentativeOutputs(fixture)).toEqual(readRepresentativeOutputs(clean));
	} finally {
		clean.close();
	}
}

it.each([false, true])("matches clean builds after a seeded edit history (incremental=%s)", incremental => {
	createRepresentativeProject(fixture, incremental);
	const build = fixture.createBuild();
	expectSuccess(build.build());

	const outputs = readRepresentativeOutputs(fixture);
	expect(Object.keys(outputs).filter(file => file.endsWith(".luau")).length).toBeGreaterThan(100);
	expectCleanEquivalent();

	// a fixed seed makes every failure reproducible while spreading edits across the content graph
	let seed = 0x5eed;
	for (let step = 0; step < 3; step++) {
		const changed = new Array<string>();
		for (const kind of ["items", "enemies", "biomes"]) {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
			const relative = `catalog/src/${kind}/entry${seed % CONTENT_COUNT}.ts`;
			fixture.write(relative, fixture.read(relative).replace(/id: \d+/, `id: ${step + 10}`));
			changed.push(fixture.file(relative));
		}
		const result = build.build(changed);
		expectSuccess(result);
		expectCleanEquivalent(result);
	}

	const added = "inventory/src/capacity.ts";
	fixture.write(added, "export const capacity = 20;");
	expectSuccess(build.build([fixture.file(added)]));
	expectCleanEquivalent();

	const renamed = "inventory/src/slots.ts";
	fs.renameSync(fixture.file(added), fixture.file(renamed));
	fixture.write("world/src/weather.luau", "return { weather = 'rain' }\n");
	fs.removeSync(fixture.file("world/src/settings.json"));
	expectSuccess(
		build.build(
			[added, renamed, "world/src/weather.luau", "world/src/settings.json"].map(file => fixture.file(file)),
		),
	);
	expectCleanEquivalent();

	fs.removeSync(fixture.file(renamed));
	expectSuccess(build.build([fixture.file(renamed)]));
	expectCleanEquivalent();

	const cleanBuild = new ProjectBuild(fixture.file("game/tsconfig.json"), fixture.options());
	try {
		expectSuccess(cleanBuild.build());
		expectCleanEquivalent();
	} finally {
		cleanBuild.close();
	}
});

it("preserves a failed dependency and matches a clean build after repair", () => {
	createRepresentativeProject(fixture);
	const build = fixture.createBuild();
	expectSuccess(build.build());
	const before = readRepresentativeOutputs(fixture);
	const relative = "core/src/types.ts";
	const original = fixture.read(relative);
	fixture.write(relative, `${original}\nexport const invalid: number = "broken";`);

	const result = build.build([fixture.file(relative)]);
	expect(result.emitSkipped).toBe(true);
	expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(2322);
	expect(readRepresentativeOutputs(fixture)).toEqual(before);

	const clean = new ReferenceFixture();
	try {
		copyRepresentativeSources(fixture, clean);
		expect(diagnostics(result, fixture.directory)).toEqual(
			diagnostics(clean.createBuild().build(), clean.directory),
		);
	} finally {
		clean.close();
	}

	fixture.write(relative, original);
	fixture.write("world/src/weather.luau", "return { weather = 'storm' }\n");
	expectSuccess(build.build([relative, "world/src/weather.luau"].map(file => fixture.file(file))));
	expectCleanEquivalent();
});

it.each([false, true])("matches a clean build after CLI watch edits and recovery (polling=%s)", async polling => {
	createRepresentativeProject(fixture);
	const watch = await startWatch(fixture, polling, "cli");
	try {
		expect(watch.log).toContain("Found 0 errors");
		expectCleanEquivalent();

		const original = fixture.read("core/src/math.ts");
		await watch.edit(() => {
			fixture.write("core/src/math.ts.tmp", original.replace("value * multiplier", "value * multiplier + 1"));
			fs.renameSync(fixture.file("core/src/math.ts.tmp"), fixture.file("core/src/math.ts"));
			fixture.write("world/src/weather.luau", "return { weather = 'snow' }\n");
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
		expectCleanEquivalent();

		const before = readRepresentativeOutputs(fixture);
		await watch.edit(() => fixture.write("core/src/math.ts", `${original}\nexport const broken: number = "bad";`));
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 1 error");
		expect(readRepresentativeOutputs(fixture)).toEqual(before);

		await watch.edit(() => {
			fixture.write("core/src/math.ts", original);
			fixture.write("world/src/settings.json", '{ "fog": 250 }\n');
			fixture.write("presentation/src/tooltip.ts", 'export const tooltip = "Ready";');
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
		expectCleanEquivalent();

		await watch.edit(() => {
			fs.removeSync(fixture.file("presentation/src/tooltip.ts"));
			const config = fs.readJsonSync(fixture.file("inventory/tsconfig.json"));
			fixture.json("inventory/tsconfig.json", { ...config, rbxts: { luau: false } });
		});
		expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
		expectCleanEquivalent();
	} finally {
		await watch.close();
	}
});

it("runs the representative game through Rojo and Lune", () => {
	createRepresentativeProject(fixture);
	expectSuccess(fixture.createBuild().build());
	const place = fixture.file("representative.rbxl");
	execFileSync("rojo", ["build", fixture.file("default.project.json"), "-o", place], { encoding: "utf8" });
	const output = execFileSync("lune", ["run", path.join(PACKAGE_ROOT, "tests/runTestsWithLune.lua"), place], {
		encoding: "utf8",
	});
	expect(output).toContain("representative game passed");
});
