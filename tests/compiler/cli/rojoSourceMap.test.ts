import childProcess from "child_process";
import { getRojoSourceMap } from "CLI/util/getRojoSourceMap";

import { RojoFixture } from "./rojoFixture";

let fixture: RojoFixture;

beforeEach(() => {
	fixture = new RojoFixture();
});

afterEach(() => {
	fixture.close();
	jest.restoreAllMocks();
});

it("reads script-only sourcemaps by default and includes other instances on request", () => {
	fixture.tree({
		$className: "DataModel",
		Workspace: { $className: "Workspace", Part: { $className: "Part" } },
	});

	const scripts = getRojoSourceMap(fixture.file("game/default.project.json"));
	const all = getRojoSourceMap(fixture.file("game/default.project.json"), true);

	expect(scripts).toBeNull();
	expect(all?.children?.[0].children?.[0]).toEqual({ name: "Part", className: "Part" });
});

it("reads maps larger than Node's default subprocess buffer", () => {
	const children = Object.fromEntries(
		Array.from({ length: 26000 }, (_, index) => [
			`EnvironmentPart${index.toString().padStart(5, "0")}`,
			{ $className: "Part" },
		]),
	);
	fixture.tree({ $className: "DataModel", Workspace: { $className: "Workspace", ...children } });

	const sourceMap = getRojoSourceMap(fixture.file("game/default.project.json"), true);

	expect(sourceMap?.children?.[0].children).toHaveLength(26000);
	expect(JSON.stringify(sourceMap).length).toBeGreaterThan(1024 * 1024);
});

it("reports Rojo's error when the selected project does not exist", () => {
	expect(() => getRojoSourceMap(fixture.file("missing.project.json"))).toThrow(
		/rojo sourcemap returned a non-zero exit code[\s\S]*missing\.project\.json/,
	);
});

it.each([
	["ENOENT", "Rojo is not installed"],
	["EACCES", "permission denied"],
])("reports executable failures with code %s", (code, message) => {
	jest.spyOn(childProcess, "spawnSync").mockReturnValue({
		pid: 0,
		output: [],
		stdout: Buffer.alloc(0),
		stderr: Buffer.alloc(0),
		status: null,
		signal: null,
		error: Object.assign(new Error("permission denied"), { code }),
	});

	expect(() => getRojoSourceMap(fixture.file("game/default.project.json"))).toThrow(message);
});
