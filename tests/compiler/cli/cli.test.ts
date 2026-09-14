import { CLIError } from "CLI/errors/CLIError";
import { LogService } from "Shared/classes/LogService";
import { COMPILER_VERSION, PACKAGE_ROOT } from "Shared/constants";

const originalExitCode = process.exitCode;

afterEach(() => {
	process.exitCode = originalExitCode;
	jest.restoreAllMocks();
	jest.dontMock("yargs/yargs");
	jest.dontMock("yargs/helpers");
	jest.dontMock("CLI/errors/CLIError");
	jest.dontMock("Shared/classes/LogService");
});

function loadCli() {
	const catchError = jest.fn();
	const parser = {
		usage: jest.fn().mockReturnThis(),
		help: jest.fn().mockReturnThis(),
		alias: jest.fn().mockReturnThis(),
		describe: jest.fn().mockReturnThis(),
		version: jest.fn().mockReturnThis(),
		commandDir: jest.fn().mockReturnThis(),
		recommendCommands: jest.fn().mockReturnThis(),
		strict: jest.fn().mockReturnThis(),
		wrap: jest.fn().mockReturnThis(),
		terminalWidth: jest.fn().mockReturnValue(80),
		fail: jest.fn().mockReturnThis(),
		parseAsync: jest.fn().mockReturnValue({ catch: catchError }),
	};
	const createParser = jest.fn().mockReturnValue(parser);
	jest.isolateModules(() => {
		// native CLI tests exercise real yargs; isolate its ESM entry point for error-handler tests
		jest.doMock("yargs/yargs", () => createParser);
		jest.doMock("yargs/helpers", () => ({ hideBin: (argv: Array<string>) => argv.slice(2) }));
		jest.doMock("CLI/errors/CLIError", () => ({ CLIError }));
		jest.doMock("Shared/classes/LogService", () => ({ LogService }));
		jest.requireActual("CLI/cli");
	});
	return {
		parser,
		createParser,
		fail: parser.fail.mock.calls[0][0] as (message?: string) => void,
		catchError: catchError.mock.calls[0][0] as (error: unknown) => void,
	};
}

it("configures strict command discovery, help, version, and asynchronous parsing", () => {
	const { parser, createParser } = loadCli();

	expect(createParser).toHaveBeenCalledWith(process.argv.slice(2));
	expect(parser.commandDir).toHaveBeenCalledWith(`${PACKAGE_ROOT}/out/CLI/commands`);
	expect(parser.version).toHaveBeenCalledWith(COMPILER_VERSION);
	expect(parser.help).toHaveBeenCalledWith("help");
	expect(parser.strict).toHaveBeenCalledTimes(1);
	expect(parser.wrap).toHaveBeenCalledWith(80);
	expect(parser.parseAsync).toHaveBeenCalledTimes(1);
});

it.each([undefined, "invalid flag"])("marks parser failures unsuccessful with message %s", message => {
	const fatal = jest.spyOn(LogService, "fatal").mockImplementation(() => {
		throw new Error("exit");
	});
	const { fail } = loadCli();
	if (message) {
		expect(() => fail(message)).toThrow("exit");
		expect(fatal).toHaveBeenCalledWith(message);
	} else {
		fail(message);
		expect(fatal).not.toHaveBeenCalled();
	}
	expect(process.exitCode).toBe(1);
});

it("logs CLI errors rejected by the parser", () => {
	const error = new CLIError("invalid command");
	const log = jest.spyOn(error, "log").mockImplementation(() => {});
	const { catchError } = loadCli();

	catchError(error);

	expect(log).toHaveBeenCalledTimes(1);
	expect(error.toString()).toContain("invalid command");
});

it("rethrows unexpected parser failures", () => {
	const error = new Error("unexpected parser failure");
	const { catchError } = loadCli();

	expect(() => catchError(error)).toThrow(error);
});
