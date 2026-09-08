import chokidar from "chokidar";
import { setupProjectWatchProgram } from "Project/functions/setupProjectWatchProgram";
import ts from "typescript";

import { expectSuccess, ReferenceFixture } from "./referenceFixture";

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
	expectSuccess(fixture.createBuild().build());
	const output = fixture.read("out/game/init.luau");
	const { events, watch } = createWatch();

	try {
		events.emit("ready");
		fixture.write("game/src/index.ts", "export const value = 2;");
		events.emit("change", fixture.file("game/src/index.ts"));

		expect(() => jest.advanceTimersByTime(100)).toThrow("watch transformer failed");
		expect(fixture.read("out/game/init.luau")).toBe(output);
	} finally {
		await watch.close();
	}
});
