import childProcess from "child_process";
import { LogService } from "Shared/classes/LogService";
import { assertNever } from "TSTransformer/util/assertNever";
import ts from "typescript";

beforeEach(() => {
	jest.spyOn(LogService, "fatal").mockImplementation(message => {
		throw new Error(message);
	});
});

afterEach(() => jest.restoreAllMocks());

function mockNpm(stdout: string) {
	return jest.spyOn(childProcess, "spawnSync").mockReturnValue({
		pid: 1,
		output: [null, stdout, ""],
		stdout,
		stderr: "",
		status: 0,
		signal: null,
	});
}

it("reports syntax kinds and the compiler's installed TypeScript version", () => {
	const spawn = mockNpm(JSON.stringify({ name: "roblox-ts", dependencies: { typescript: { version: "5.9.3" } } }));

	const expression = ts.factory.createPrefixUnaryExpression(
		ts.SyntaxKind.MinusToken,
		ts.factory.createNumericLiteral(1),
	);
	expect(() => assertNever(expression as never, "unexpected expression")).toThrow(
		"unexpected expression, value was a TS node of kind PrefixUnaryExpression",
	);
	expect(LogService.fatal).toHaveBeenCalledWith(expect.stringContaining("npm install typescript@=5.9.3"));
	expect(spawn).toHaveBeenCalledWith("npm", ["ls", "typescript", "--json"], {
		encoding: "utf8",
		shell: process.platform === "win32",
	});
});

it("finds TypeScript below an installed compiler after unrelated leaf dependencies", () => {
	mockNpm(
		JSON.stringify({
			name: "project",
			dependencies: {
				unrelated: { version: "1.0.0" },
				wrapper: { dependencies: { "roblox-ts": { dependencies: { typescript: { version: "5.9.3" } } } } },
			},
		}),
	);

	expect(() => assertNever("unknown" as never, "unexpected operator")).toThrow("npm install typescript@=5.9.3");
});

it.each(["", "invalid JSON", "{}", '{"name":"roblox-ts"}', '{"name":"roblox-ts","dependencies":{}}'])(
	"keeps the original assertion when npm returns %j",
	output => {
		mockNpm(output);

		expect(() => assertNever(null as never, "unexpected value")).toThrow("unexpected value, value was null");
		expect(LogService.fatal).toHaveBeenCalledWith(expect.not.stringContaining("npm install typescript@="));
	},
);

it("keeps the original assertion when npm cannot start", () => {
	jest.spyOn(childProcess, "spawnSync").mockImplementation(() => {
		throw new Error("npm unavailable");
	});

	expect(() => assertNever({ kind: ts.SyntaxKind.PlusToken } as never, "unexpected token")).toThrow(
		"unexpected token, value was { kind:",
	);
});

it("uses the command shell for npm on Windows", () => {
	const spawn = mockNpm("{}");
	const platform = process.platform;
	Object.defineProperty(process, "platform", { value: "win32" });
	try {
		expect(() => assertNever(42 as never, "unexpected value")).toThrow("unexpected value, value was 42");
		expect(spawn).toHaveBeenCalledWith("npm", ["ls", "typescript", "--json"], { encoding: "utf8", shell: true });
	} finally {
		Object.defineProperty(process, "platform", { value: platform });
	}
});
