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

it("writes raw chunks without adding separators", () => {
	LogService.write("first");
	LogService.write(" second\n");

	expect(output()).toBe("first second\n");
});

it("finishes a partial line before writing messages on separate lines", () => {
	LogService.write("progress");
	LogService.writeLine("first", "second");
	LogService.writeLine("third");

	expect(output()).toBe("progress\nfirst\nsecond\nthird\n");
});

it("does not add a blank line after a completed write", () => {
	LogService.write("complete\n");
	LogService.writeLine("next");

	expect(output()).toBe("complete\nnext\n");
});

it("only finishes a pending partial line when called without messages", () => {
	LogService.writeLine();
	expect(stdout).not.toHaveBeenCalled();

	LogService.write("partial");
	LogService.writeLine();
	LogService.writeLine();

	expect(output()).toBe("partial\n");
});

it("converts non-string messages to text and preserves empty lines", () => {
	LogService.writeLine(42, false, undefined, null, { toString: () => "object" }, "");

	expect(output()).toBe("42\nfalse\nundefined\nnull\nobject\n\n");
});

it("suppresses verbose messages without interrupting a partial line", () => {
	LogService.write("progress");
	LogService.writeLineIfVerbose("hidden");
	LogService.write(" complete\n");

	expect(output()).toBe("progress complete\n");
});

it("writes all verbose messages when enabled", () => {
	LogService.verbose = true;
	LogService.write("progress");
	LogService.writeLineIfVerbose("first", 42);

	expect(output()).toBe("progress\nfirst\n42\n");
});

it.each([false, true])("prefixes warnings with a yellow label when colors are enabled: %s", enabled => {
	kleur.enabled = enabled;
	LogService.write("progress");
	LogService.warn("warning message");

	const label = enabled ? "\u001b[33mCompiler Warning:\u001b[39m" : "Compiler Warning:";
	expect(output()).toBe(`progress\n${label} warning message\n`);
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
