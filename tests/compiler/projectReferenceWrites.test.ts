import fs from "fs-extra";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

it("preserves unchanged declaration and map files when writeOnlyChanged is enabled", () => {
	const fixture = new ReferenceFixture();
	try {
		fixture.project("game", [], { declaration: true, declarationMap: true });
		fixture.write("game/src/index.ts", "export function value(input: number) { return input + 1; }");
		const build = fixture.createBuild({ writeOnlyChanged: true });
		expectSuccess(build.build());
		const files = ["out/game/index.d.ts", "out/game/index.d.ts.map"];
		const before = files.map(file => fixture.read(file));
		const timestamp = new Date("2020-01-01T00:00:00Z");
		for (const file of files) {
			fs.utimesSync(fixture.file(file), timestamp, timestamp);
		}

		fixture.write("game/src/index.ts", "export function value(input: number) { return input + 2; }");
		expectSuccess(build.build([fixture.file("game/src/index.ts")]));

		expect(fixture.read("out/game/init.luau")).toContain("input + 2");
		expect(files.map(file => fixture.read(file))).toEqual(before);
		for (const file of files) {
			expect(fs.statSync(fixture.file(file)).mtimeMs).toBe(timestamp.getTime());
		}
	} finally {
		fixture.close();
	}
});
