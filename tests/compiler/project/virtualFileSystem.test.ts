import { VirtualFileSystem } from "Project/classes/VirtualFileSystem";

it("treats missing paths, directories, and paths below files as unreadable files", () => {
	const vfs = new VirtualFileSystem();
	vfs.writeFile("/directory/file.ts", "export {};");

	expect(vfs.readFile("/missing/file.ts")).toBeUndefined();
	expect(vfs.readFile("/directory")).toBeUndefined();
	expect(vfs.readFile("/directory/file.ts/child")).toBeUndefined();
	expect(vfs.fileExists("/directory/file.ts/child")).toBe(false);
	expect(vfs.directoryExists("/directory/file.ts")).toBe(false);
});

it("lists only directories and returns no children for missing paths or files", () => {
	const vfs = new VirtualFileSystem();
	vfs.writeFile("/directory/file.ts", "export {};");
	vfs.writeFile("/directory/nested/child.ts", "export {};");

	expect(vfs.getDirectories("/directory")).toEqual(["/directory/nested"]);
	expect(vfs.getDirectories("/missing")).toEqual([]);
	expect(vfs.getDirectories("/directory/file.ts")).toEqual([]);
});
