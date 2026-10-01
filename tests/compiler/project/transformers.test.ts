import fs from "fs-extra";
import { createProjectProgram } from "Project";
import { compileFiles } from "Project/functions/compileFiles";
import { createPathTranslator } from "Project/functions/createPathTranslator";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";

import { expectSuccess, ReferenceFixture, startWatch } from "../referenceFixture";

jest.setTimeout(60000);

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
});
afterEach(() => fixture.close());

const importingSource = 'import { value } from "./Helper"; export const actual: number = value;';

function createInliningProject(roots: "files" | "exclude") {
	fixture.project("game", [], { declaration: true, plugins: [{ transform: "../inline.cjs" }] });
	const config = fs.readJsonSync(fixture.file("game/tsconfig.json"));
	if (roots === "files") {
		delete config.include;
		config.files = ["src/index.ts"];
	} else {
		config.exclude = ["src/Helper.ts"];
	}
	fixture.json("game/tsconfig.json", config);
	fixture.write("game/src/index.ts", importingSource);
	fixture.write("game/src/Helper.ts", "export const value = 42;");
	fixture.write(
		"inline.cjs",
		`module.exports = (program, config, { ts }) => () => source => {
		if (!source.text.includes('"./Helper"')) {
			return source;
		}
		const helper = program.getSourceFiles().find(file => file.fileName.endsWith("/Helper.ts"));
		const value = helper.statements[0].declarationList.declarations[0].initializer.getText(helper);
		return ts.createSourceFile(source.fileName, "export const actual: number = " + value + ";", ts.ScriptTarget.Latest);
	};`,
	);
}

it.each(["files", "exclude"] as const)("emits transformed transitive sources selected through %s", roots => {
	createInliningProject(roots);
	const { data } = fixture.createBuild().graph.root;
	const builder = createProjectProgram(data);

	expectSuccess(
		compileFiles(builder.getProgram(), data, createPathTranslator(builder, data), getChangedSourceFiles(builder)),
	);

	expect(fixture.read("out/game/init.luau")).toContain("local actual = 42");
	expect(fixture.read("out/game/Helper.luau")).toContain("local value = 42");
	expect(fixture.read("out/game/index.d.ts")).toContain("actual: number");
	expect(fixture.read("out/game/Helper.d.ts")).toContain("value = 42");
});

it.each(["project", "cli"] as const)(
	"updates inlined imports through edits, errors, and removal in %s watch",
	async mode => {
		createInliningProject("exclude");
		const watch = await startWatch(fixture, false, mode);
		try {
			expect(watch.log).toContain("Found 0 errors");
			expect(fixture.read("out/game/init.luau")).toContain("local actual = 42");

			await watch.edit(() => fixture.write("game/src/Helper.ts", "export const value = 43;"));
			expect(fixture.read("out/game/init.luau")).toContain("local actual = 43");

			await watch.edit(() => fixture.write("game/src/Helper.ts", 'export const value: number = "bad";'));
			expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toMatch(/Found [1-9]\d* errors?/);
			expect(fixture.read("out/game/init.luau")).toContain("local actual = 43");

			await watch.edit(() => fixture.write("game/src/Helper.ts", "export const value = 44;"));
			expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
			expect(fixture.read("out/game/init.luau")).toContain("local actual = 44");

			await watch.edit(() => {
				fixture.write("game/src/index.ts", "export const actual = 45;");
				fs.removeSync(fixture.file("game/src/Helper.ts"));
			});
			expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
			expect(fixture.read("out/game/init.luau")).toContain("local actual = 45");

			await watch.edit(() => {
				fixture.write("game/src/Helper.ts", "export const value = 46;");
				fixture.write("game/src/index.ts", importingSource);
			});
			expect(watch.log.slice(watch.log.lastIndexOf("Found "))).toContain("Found 0 errors");
			expect(fixture.read("out/game/init.luau")).toContain("local actual = 46");
		} finally {
			await watch.close();
		}
	},
);
