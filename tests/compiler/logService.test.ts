import kleur from "kleur";
import { LogService } from "Shared/classes/LogService";

const originalVerbose = LogService.verbose;
const originalColors = kleur.enabled;
let stdout: jest.SpyInstance;

beforeEach(() => {
	stdout = jest.spyOn(process.stdout, "write").mockReturnValue(true);
	LogService.verbose = false;
	LogService.write("\n");
	stdout.mockClear();
});

afterEach(() => {
	LogService.write("\n");
	LogService.verbose = originalVerbose;
	kleur.enabled = originalColors;
	jest.restoreAllMocks();
});

function output() {
	return stdout.mock.calls.map(([message]) => message).join("");
}

it("separates raw writes and formatted messages without adding extra blank lines", () => {
	LogService.write("first");
	LogService.write(" second");
	LogService.writeLine(42, false, undefined, null, { toString: () => "object" }, "");
	LogService.write("complete\n");
	LogService.writeLine("next");

	expect(output()).toBe("first second\n42\nfalse\nundefined\nnull\nobject\n\ncomplete\nnext\n");
});

it("only finishes a pending partial line when called without messages", () => {
	LogService.writeLine();
	expect(stdout).not.toHaveBeenCalled();

	LogService.write("partial");
	LogService.writeLine();
	LogService.writeLine();

	expect(output()).toBe("partial\n");
});

it("only interrupts a partial line for verbose messages when enabled", () => {
	LogService.write("progress");
	LogService.writeLineIfVerbose("hidden");
	expect(output()).toBe("progress");

	LogService.verbose = true;
	LogService.writeLineIfVerbose("first", 42);

	expect(output()).toBe("progress\nfirst\n42\n");
});

it("formats warnings with and without terminal colors", () => {
	kleur.enabled = false;
	LogService.warn("plain");
	kleur.enabled = true;
	LogService.warn("warning message");

	expect(output()).toBe("Compiler Warning: plain\n\u001b[33mCompiler Warning:\u001b[39m warning message\n");
});

it("writes a fatal message before exiting with status one", () => {
	const exitSignal = new Error("process exited");
	const exit = jest.spyOn(process, "exit").mockImplementation(() => {
		expect(output()).toBe("progress\nfatal message\n");
		throw exitSignal;
	});
	LogService.write("progress");

	expect(() => LogService.fatal("fatal message")).toThrow(exitSignal);
	expect(exit).toHaveBeenCalledTimes(1);
	expect(exit).toHaveBeenCalledWith(1);
});
