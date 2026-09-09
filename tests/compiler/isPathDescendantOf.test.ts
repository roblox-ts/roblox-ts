import path from "path";
import { isPathDescendantOf } from "Shared/util/isPathDescendantOf";

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

// different drive letters only have filesystem semantics on Windows
const windowsIt = process.platform === "win32" ? it : it.skip;
windowsIt("rejects paths on a different Windows drive", () => {
	expect(isPathDescendantOf("D:\\project\\src\\file.ts", "C:\\project\\src")).toBe(false);
	expect(isPathDescendantOf("C:\\project\\src\\file.ts", "D:\\project\\src")).toBe(false);
});
