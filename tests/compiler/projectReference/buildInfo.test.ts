import { execFileSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import { PACKAGE_ROOT } from "Shared/constants";
import { assert } from "Shared/util/assert";

import { expectSuccess, ReferenceFixture } from "../referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

it("rejects collisions between TypeScript and rbxtsc cache paths", () => {
	fixture.project("shared", [], { tsBuildInfoFile: "../cache/shared.tsbuildinfo" });
	fixture.project("game", ["shared"], { tsBuildInfoFile: "../cache/shared.rbxtsc.tsbuildinfo" });

	expect(() => fixture.createBuild()).toThrow("Multiple projects write");
});

it.each(["../cache/game.tsbuildinfo", "../out/game/build.tsbuildinfo"])(
	"keeps tsc -b and rbxtsc build information independent at %s",
	tsBuildInfoFile => {
		fixture.project("game", [], { composite: true, tsBuildInfoFile });
		const build = fixture.createBuild({ writeOnlyChanged: false });
		expectSuccess(build.build());
		const buildInfo = build.graph.root.pathTranslator?.buildInfoOutputPath;
		assert(buildInfo);
		const before = fs.readFileSync(buildInfo, "utf8");

		execFileSync(
			process.execPath,
			[path.join(PACKAGE_ROOT, "node_modules/typescript/lib/tsc.js"), "--build", fixture.file("game")],
			{
				cwd: fixture.directory,
			},
		);

		expect(fs.readFileSync(buildInfo, "utf8")).toBe(before);
		const tsBuildInfo = path.resolve(fixture.file("game"), tsBuildInfoFile);
		const tscContents = fs.readFileSync(tsBuildInfo, "utf8");
		const next = fixture.createBuild({ writeOnlyChanged: false }).build();
		expectSuccess(next);
		expect(next.emittedFiles).toEqual([]);
		expect(fs.readFileSync(tsBuildInfo, "utf8")).toBe(tscContents);
	},
);

it.each([undefined, "../cache/custom.cache"])(
	"namespaces default and custom build information paths (%s)",
	tsBuildInfoFile => {
		fixture.project("game", [], { composite: true, tsBuildInfoFile });
		const build = fixture.createBuild();

		expectSuccess(build.build());

		const output = build.graph.root.pathTranslator?.buildInfoOutputPath;
		assert(output);
		expect(output).toMatch(/\.rbxtsc\.tsbuildinfo$/);
		if (tsBuildInfoFile) {
			expect(output).toBe(fixture.file("cache/custom.cache.rbxtsc.tsbuildinfo"));
		}
		expect(fs.existsSync(output)).toBe(true);
	},
);
