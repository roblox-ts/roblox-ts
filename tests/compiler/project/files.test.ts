import { PathTranslator } from "@roblox-ts/path-translator";
import fs from "fs-extra";
import { cleanup, createProjectData } from "Project";
import { copyItem } from "Project/functions/copyItem";
import { DEFAULT_PROJECT_OPTIONS } from "Shared/constants";

import { ReferenceFixture } from "../referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => {
	jest.restoreAllMocks();
	fixture.close();
});

function translator(declaration = false) {
	return new PathTranslator(
		fixture.file("src"),
		fixture.file("out"),
		fixture.file("out/project.tsbuildinfo"),
		declaration,
		true,
	);
}

it("cleans orphan outputs while preserving live files, build info, and git metadata", () => {
	fixture.write("src/live.ts", "export const value = 1;");
	fixture.write("src/nested/live.ts", "export const value = 2;");
	fixture.write("out/live.luau", "return 1");
	fixture.write("out/live.d.ts", "export declare const value: number;");
	fixture.write("out/nested/live.luau", "return 2");
	fixture.write("out/orphan/old.luau", "return 0");
	fixture.write("out/project.tsbuildinfo", "build info");
	fixture.write("out/.git/HEAD", "git metadata");

	cleanup(translator());

	expect(fixture.read("out/live.luau")).toBe("return 1");
	expect(fixture.read("out/nested/live.luau")).toBe("return 2");
	expect(fixture.read("out/project.tsbuildinfo")).toBe("build info");
	expect(fixture.read("out/.git/HEAD")).toBe("git metadata");
	expect(fs.existsSync(fixture.file("out/live.d.ts"))).toBe(false);
	expect(fs.existsSync(fixture.file("out/orphan"))).toBe(false);
});

it("retains declaration outputs when declarations are enabled", () => {
	fixture.write("src/live.ts", "export const value = 1;");
	fixture.write("out/live.d.ts", "export declare const value: number;");

	cleanup(translator(true));

	expect(fs.existsSync(fixture.file("out/live.d.ts"))).toBe(true);
});

it("accepts an output directory that does not exist", () => {
	cleanup(translator());

	expect(fs.existsSync(fixture.file("out"))).toBe(false);
});

it("tolerates a child directory disappearing after it is listed", () => {
	const child = fixture.file("out/removed");
	fs.ensureDirSync(child);
	const stat = fs.statSync;
	jest.spyOn(fs, "statSync").mockImplementation((...args: Parameters<typeof fs.statSync>) => {
		const result = stat(...args);
		if (args[0] === child) {
			fs.removeSync(child);
		}
		return result;
	});

	cleanup(translator());

	expect(fs.existsSync(child)).toBe(false);
});

it.each([false, true])("copies assets and declarations with writeOnlyChanged=%s", writeOnlyChanged => {
	fixture.write("src/nested/asset.lua", "return 1");
	fixture.write("src/source.ts", "export const value = 1;");
	fixture.write("src/types.d.ts", "export interface Shape {}");
	fixture.write("out/nested/asset.lua", "return 0");
	const data = createProjectData(fixture.file("tsconfig.json"), { ...DEFAULT_PROJECT_OPTIONS, writeOnlyChanged });
	const paths = translator(true);

	copyItem(data, paths, fixture.file("src"));
	expect(fixture.read("out/nested/asset.lua")).toBe("return 1");
	expect(fixture.read("out/types.d.ts")).toContain("Shape");
	expect(fs.existsSync(fixture.file("out/source.luau"))).toBe(false);

	const time = new Date(1000000000000);
	fs.utimesSync(fixture.file("out/nested/asset.lua"), time, time);
	copyItem(data, paths, fixture.file("src"));
	expect(fs.statSync(fixture.file("out/nested/asset.lua")).mtimeMs === time.getTime()).toBe(writeOnlyChanged);
});
