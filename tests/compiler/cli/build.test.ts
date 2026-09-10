import buildCommand from "CLI/commands/build";
import { CLIError } from "CLI/errors/CLIError";
import { ProjectBuild } from "Project/classes/ProjectBuild";
import * as watch from "Project/functions/setupProjectWatchProgram";
import { LogService } from "Shared/classes/LogService";
import ts from "typescript";
import type yargs from "yargs";

import { ReferenceFixture } from "../referenceFixture";

let fixture: ReferenceFixture;
let output: string;
const originalExitCode = process.exitCode;
const originalVerbose = LogService.verbose;

beforeEach(() => {
	fixture = new ReferenceFixture();
	fixture.project("game");
	output = "";
	process.exitCode = undefined;
	jest.spyOn(ts.sys, "write").mockImplementation(message => {
		output += message;
	});
	jest.spyOn(LogService, "writeLine").mockImplementation((...messages) => {
		output += messages.join("\n");
	});
});

afterEach(() => {
	fixture.close();
	process.exitCode = originalExitCode;
	LogService.verbose = originalVerbose;
	jest.restoreAllMocks();
});

async function build(project = "game", options = {}) {
	await buildCommand.handler({
		_: [],
		$0: "rbxtsc",
		project: fixture.file(project),
		...fixture.options(),
		...options,
	});
}

it.each(["game", "game/tsconfig.json", "game/src"])("finds the project configuration from %s", async project => {
	const close = jest.spyOn(ProjectBuild.prototype, "close");

	await build(project);

	expect(fixture.read("out/game/init.luau")).toContain("local value = 1");
	expect(process.exitCode).toBeUndefined();
	expect(close).toHaveBeenCalledTimes(1);
});

it.each(["missing", "."])("reports a missing configuration for %s", async project => {
	await build(project);

	expect(output).toContain("Unable to find tsconfig.json!");
	expect(process.exitCode).toBe(1);
});

it("reports compiler errors and closes the build", async () => {
	fixture.write("game/src/index.ts", 'export const value: number = "invalid";');
	const close = jest.spyOn(ProjectBuild.prototype, "close");

	await build();

	expect(output).toContain("Type 'string' is not assignable to type 'number'");
	expect(process.exitCode).toBe(1);
	expect(close).toHaveBeenCalledTimes(1);
});

it("reports warnings without making the command fail", async () => {
	fixture.write("game/src/index.ts", "export function truthy(value: number) { return !!value; }");

	await build("game", { logTruthyChanges: true });

	expect(output).toContain("Value will be checked against 0, NaN");
	expect(fixture.read("out/game/init.luau")).toContain("local function truthy");
	expect(process.exitCode).toBeUndefined();
});

it.each([false, true])("passes polling=%s to watch mode and leaves the build open", async usePolling => {
	const setup = jest.spyOn(watch, "setupProjectWatchProgram").mockImplementation(build => {
		return { close: async () => build.close() };
	});
	const compile = jest.spyOn(ProjectBuild.prototype, "build");
	const close = jest.spyOn(ProjectBuild.prototype, "close");

	try {
		await build("game", { watch: true, usePolling, verbose: true });

		expect(setup).toHaveBeenCalledWith(expect.any(ProjectBuild), usePolling);
		expect(compile).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
		expect(LogService.verbose).toBe(true);
	} finally {
		for (const [build] of setup.mock.calls) {
			build.close();
		}
	}
});

it("logs expected build failures and closes the build", async () => {
	jest.spyOn(ProjectBuild.prototype, "build").mockImplementation(() => {
		throw new CLIError("build failed");
	});
	const close = jest.spyOn(ProjectBuild.prototype, "close");

	await build();

	expect(output).toContain("build failed");
	expect(process.exitCode).toBe(1);
	expect(close).toHaveBeenCalledTimes(1);
});

it("rethrows unexpected build failures after closing the build", async () => {
	const error = new Error("unexpected failure");
	jest.spyOn(ProjectBuild.prototype, "build").mockImplementation(() => {
		throw error;
	});
	const close = jest.spyOn(ProjectBuild.prototype, "close");

	await expect(build()).rejects.toBe(error);

	expect(process.exitCode).toBe(1);
	expect(close).toHaveBeenCalledTimes(1);
});

it("registers build flags without overriding project defaults", () => {
	const option = jest.fn().mockReturnThis();
	const parser = { option } as unknown as yargs.Argv;
	if (typeof buildCommand.builder !== "function") {
		throw new Error("Expected a build command builder");
	}

	buildCommand.builder(parser);

	expect(option.mock.calls.map(([name]) => name)).toEqual([
		"project",
		"watch",
		"usePolling",
		"verbose",
		"noInclude",
		"logTruthyChanges",
		"writeOnlyChanged",
		"writeTransformedFiles",
		"optimizedLoops",
		"type",
		"includePath",
		"rojo",
		"allowCommentDirectives",
		"luau",
	]);
	expect(option).toHaveBeenCalledWith("project", expect.objectContaining({ alias: "p", default: "." }));
	expect(option).toHaveBeenCalledWith("usePolling", expect.objectContaining({ implies: "watch" }));
	for (const [, configuration] of option.mock.calls.slice(1)) {
		expect(configuration).not.toHaveProperty("default");
	}
});
