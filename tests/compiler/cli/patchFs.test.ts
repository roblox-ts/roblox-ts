import fs from "fs-extra";

afterEach(() => {
	jest.dontMock("fs-extra");
});

function patch(filesystem: Record<string, unknown>) {
	jest.isolateModules(() => {
		jest.doMock("fs-extra", () => filesystem);
		jest.requireActual("CLI/util/patchFs");
	});
	return filesystem as unknown as typeof fs;
}

it("preserves every existing filesystem implementation", () => {
	const original = { ...fs };
	const filesystem = { ...original };

	patch(filesystem);

	expect(filesystem).toEqual(original);
});

it("provides callable filesystem fallbacks for the browser", async () => {
	const filesystem = patch({});

	await expect(filesystem.copy("source", "target")).resolves.toBeUndefined();
	expect(filesystem.copySync("source", "target")).toBeUndefined();
	expect(filesystem.existsSync("missing")).toBe(false);
	await expect(filesystem.outputFile("file", "text")).resolves.toBeUndefined();
	expect(filesystem.outputFileSync("file", "text")).toBeUndefined();
	await expect(filesystem.pathExists("missing")).resolves.toBe(false);
	expect(filesystem.pathExistsSync("missing")).toBe(false);
	await expect(filesystem.readdir("directory")).resolves.toEqual([]);
	expect(filesystem.readdirSync("directory")).toEqual([]);
	expect(filesystem.readFileSync("file")).toEqual(Buffer.from(""));
	await expect(filesystem.readJson("file")).resolves.toBeUndefined();
	expect(filesystem.readJSONSync("file")).toBeUndefined();
	expect(filesystem.realpathSync("directory/file")).toBe("directory/file");
	expect(filesystem.removeSync("file")).toBeUndefined();
	expect(filesystem.stat("file")).toEqual({});
	expect(filesystem.statSync("file")).toEqual({});
});
