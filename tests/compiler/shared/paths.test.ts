import path from "path";
import { findAncestorDir } from "Shared/util/findAncestorDir";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";

afterEach(() => {
	jest.dontMock("path");
});

describe("path descendants", () => {
	it.each([
		[".", true],
		["child/file.ts", true],
		["..cache/file.ts", true],
		["..", false],
		["../sibling/file.ts", false],
	])("classifies %s relative to the source directory", (relative, expected) => {
		const root = path.resolve("project/src");

		expect(isPathDescendantOf(path.resolve(root, relative), root)).toBe(expected);
	});

	it.each([
		["C:\\project\\src\\file.ts", "C:\\project\\src", true],
		["C:\\project\\src-other\\file.ts", "C:\\project\\src", false],
		["D:\\project\\src\\file.ts", "C:\\project\\src", false],
		["C:\\project\\src\\file.ts", "D:\\project\\src", false],
		["\\\\server\\share\\src\\file.ts", "\\\\server\\share\\src", true],
		["\\\\server\\other\\src\\file.ts", "\\\\server\\share\\src", false],
	])("classifies Windows path %s under %s", (file, directory, expected) => {
		jest.isolateModules(() => {
			// use Node's Windows path rules on every test host
			jest.doMock("path", () => path.win32);
			const { isPathDescendantOf } = jest.requireActual<typeof import("Shared/util/isPathDescendantOf")>(
				"Shared/util/isPathDescendantOf",
			);

			expect(isPathDescendantOf(file, directory)).toBe(expected);
		});
	});
});

describe("common ancestor directories", () => {
	it.each([
		[["src"], "src"],
		[["src/", "src/nested"], "src"],
		[["src/unused/../nested", "src/nested/child"], "src/nested"],
		[["src/client/nested", "src/server"], "src"],
		[["src/nested", "src-extra"], "."],
		[["src/nested", "src", "src-extra"], "."],
		[["src-extra", "src/nested"], "."],
	])("finds the common ancestor of %j", (directories, expected) => {
		const root = path.resolve("project");
		const inputs = directories.map(directory => `${root}${path.sep}${directory}`);
		const original = [...inputs];

		expect(path.resolve(findAncestorDir(inputs))).toBe(path.resolve(root, expected));
		expect(inputs).toEqual(original);
	});

	it("walks up to the filesystem root when there is no deeper common ancestor", () => {
		const root = path.parse(path.resolve("project")).root;

		expect(findAncestorDir([path.join(root, "first/nested"), path.join(root, "second")])).toBe(root);
	});
});
