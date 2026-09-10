import { createProjectData } from "Project";
import { createProgramFactory } from "Project/functions/createProgramFactory";
import { getChangedFilePaths } from "Project/functions/getChangedFilePaths";
import { getParsedCommandLine } from "Project/functions/getParsedCommandLine";
import { isCompilableFile } from "Project/util/isCompilableFile";
import { DEFAULT_PROJECT_OPTIONS } from "Shared/constants";
import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import ts from "typescript";

import { ReferenceFixture } from "../referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

it.each([false, true])("expands path hints with direct dependencies only=%s", direct => {
	fixture.project("game", [], { assumeChangesOnlyAffectDirectDependencies: direct });
	fixture.write("game/src/leaf.ts", "export const leaf = 1;");
	fixture.write("game/src/middle.ts", 'export { leaf } from "./leaf";');
	fixture.write("game/src/index.ts", 'export { leaf } from "./middle";');
	const data = createProjectData(fixture.file("game/tsconfig.json"), { ...DEFAULT_PROJECT_OPTIONS });
	const { fileNames, options } = getParsedCommandLine(data);
	const builder = createProgramFactory(data, options)(fileNames, undefined);
	const leaf = fixture.file("game/src/leaf.ts");
	const middle = fixture.file("game/src/middle.ts");
	const index = fixture.file("game/src/index.ts");

	const changed = getChangedFilePaths(builder, [leaf]);

	expect(changed).toEqual(new Set((direct ? [leaf, middle] : [leaf, middle, index]).map(getCanonicalFileName)));
	expect(getChangedFilePaths(builder)).toContain(getCanonicalFileName(index));
	expect(getChangedFilePaths(builder)).toEqual(new Set());
});

it("classifies declarations separately from compilable source files", () => {
	fixture.write("src/file.d.ts", "export interface Shape {}");
	fixture.write("src/file.tsx", "export const value = 1;");

	expect(isCompilableFile(fixture.file("src/file.d.ts"))).toBe(false);
	expect(isCompilableFile(fixture.file("src/file.tsx"))).toBe(true);
});

it("tracks changed scripts in builders without a module dependency map", () => {
	fixture.write("script.ts", "const value = 1;");
	const options = { noLib: true, module: ts.ModuleKind.None, types: [] };
	const builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
		[fixture.file("script.ts")],
		options,
		ts.createIncrementalCompilerHost(options),
	);

	expect(getChangedFilePaths(builder)).toEqual(new Set([getCanonicalFileName(fixture.file("script.ts"))]));
	expect(getChangedFilePaths(builder)).toEqual(new Set());
});
