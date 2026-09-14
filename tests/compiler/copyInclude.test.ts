import fs from "fs-extra";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
	fixture.project("game");
});
afterEach(() => fixture.close());

it("switches runtime extensions in both directions without duplicate modules", () => {
	for (const luau of [true, false, true]) {
		expectSuccess(fixture.createBuild({ luau }).build());

		for (const name of ["Promise", "RuntimeLib"]) {
			expect(fs.existsSync(fixture.file(`include/${name}.${luau ? "luau" : "lua"}`))).toBe(true);
			expect(fs.existsSync(fixture.file(`include/${name}.${luau ? "lua" : "luau"}`))).toBe(false);
		}
	}
});
