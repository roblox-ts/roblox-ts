import chokidar from "chokidar";
import fs from "fs-extra";
import { setupProjectWatchProgram } from "Project/functions/setupProjectWatchProgram";
import ts from "typescript";

import { ReferenceFixture } from "./referenceFixture";

let fixture: ReferenceFixture;
beforeEach(() => {
	fixture = new ReferenceFixture();
	jest.useFakeTimers();
	jest.spyOn(ts.sys, "write").mockImplementation(() => {});
});
afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
	fixture.close();
});

function createWatch() {
	// control filesystem notification timing while building real source files with the real compiler
	const events = new chokidar.FSWatcher();
	jest.spyOn(events, "add").mockReturnValue(events);
	jest.spyOn(events, "unwatch").mockReturnValue(events);
	jest.spyOn(chokidar, "watch").mockReturnValue(events);
	const watch = setupProjectWatchProgram(fixture.createBuild(), false);

	return { events, watch };
}

it("retains a missing Rojo file subscription across source rebuilds and releases it on close", async () => {
	fixture.project("game");
	const missing = fixture.file("generated/deep/library.project.json");
	fixture.rojo({ extra: { $path: { optional: "generated/deep/library.project.json" } } });
	const watchFile = jest.spyOn(fs, "watchFile");
	const unwatchFile = jest.spyOn(fs, "unwatchFile");
	const { events, watch } = createWatch();

	try {
		events.emit("ready");
		expect(fixture.read("out/game/init.luau")).toContain("value = 1");
		expect(watchFile).toHaveBeenCalledTimes(1);
		expect(watchFile).toHaveBeenCalledWith(missing, { interval: 250 }, expect.any(Function));

		fixture.write("game/src/index.ts", "export const value = 2;");
		events.emit("change", fixture.file("game/src/index.ts"));
		jest.advanceTimersByTime(100);

		expect(fixture.read("out/game/init.luau")).toContain("value = 2");
		expect(watchFile).toHaveBeenCalledTimes(1);
		expect(unwatchFile).not.toHaveBeenCalled();
		expect(fs.existsSync(missing)).toBe(false);
	} finally {
		await watch.close();
	}

	expect(unwatchFile).toHaveBeenCalledTimes(1);
	const [filePath, listener] = unwatchFile.mock.calls[0];
	expect(watchFile).toHaveBeenCalledWith(filePath, { interval: 250 }, listener);
});

it("cancels a pending rebuild when the watcher is closed", async () => {
	fixture.project("game");
	const { events, watch } = createWatch();

	try {
		events.emit("ready");
		const output = fixture.read("out/game/init.luau");
		fixture.write("game/src/index.ts", "export const value = 2;");
		events.emit("change", fixture.file("game/src/index.ts"));

		await watch.close();
		jest.advanceTimersByTime(1000);

		expect(fixture.read("out/game/init.luau")).toBe(output);
	} finally {
		await watch.close();
	}
});

it("propagates unexpected transformer exceptions while watching", async () => {
	fixture.project("game", [], { plugins: [{ transform: "../plugin.cjs" }] });
	fixture.write(
		"plugin.cjs",
		`module.exports = () => () => source => {
	if (source.text.includes("value = 2")) {
		throw new Error("watch transformer failed");
	}
	return source;
};`,
	);
	const { events, watch } = createWatch();

	try {
		events.emit("ready");
		expect(ts.sys.write).toHaveBeenCalledWith(expect.stringContaining("Found 0 errors"));
		const output = fixture.read("out/game/init.luau");

		fixture.write("game/src/index.ts", "export const value = 2;");
		events.emit("change", fixture.file("game/src/index.ts"));

		expect(() => jest.advanceTimersByTime(100)).toThrow("watch transformer failed");
		expect(fixture.read("out/game/init.luau")).toBe(output);
	} finally {
		await watch.close();
	}
});
