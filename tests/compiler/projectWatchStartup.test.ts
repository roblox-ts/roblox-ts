import fs from "fs-extra";

import { expectSuccess, ReferenceFixture, startWatch } from "./referenceFixture";

jest.setTimeout(30000);

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
	fixture.project("game");
	fixture.write("game/src/shared/features/items/resource.ts", "export const health = 100;");
	fixture.write("game/src/shared/features/items/model.json", '{ "ClassName": "Folder" }');
});
afterEach(() => fixture.close());

describe.each([false, true])("watch startup with polling=%s", polling => {
	it.each(["fresh", "retained build info", "removed build info", "empty output directories"])(
		"compiles once with %s",
		async state => {
			if (state === "retained build info" || state === "removed build info") {
				const build = fixture.createBuild();
				expectSuccess(build.build());
				build.close();
				fs.removeSync(fixture.file("out"));

				if (state === "removed build info") {
					fs.removeSync(fixture.file("cache"));
				}
			} else if (state === "empty output directories") {
				fs.ensureDirSync(fixture.file("out/game"));
				fs.ensureDirSync(fixture.file("include"));
			}

			const watch = await startWatch(fixture, polling);
			try {
				await watch.expectNoBuild(() => {});
				expect(watch.log.match(/Watching for file changes\./g)).toHaveLength(1);
				expect(fixture.read("out/game/shared/features/items/resource.luau")).toContain("health = 100");
				expect(fixture.read("out/game/shared/features/items/model.json")).toBe('{ "ClassName": "Folder" }');
			} finally {
				await watch.close();
			}
		},
	);

	it("compiles new files inside newly created source directories", async () => {
		const watch = await startWatch(fixture, polling);
		try {
			await watch.edit(() => {
				fixture.write("game/src/new/nested/item.ts", "export const value = 2;");
				fixture.write("game/src/new/nested/model.json", '{ "ClassName": "Folder" }');
			});

			expect(fixture.read("out/game/new/nested/item.luau")).toContain("value = 2");
			expect(fixture.read("out/game/new/nested/model.json")).toBe('{ "ClassName": "Folder" }');
		} finally {
			await watch.close();
		}
	});
});
