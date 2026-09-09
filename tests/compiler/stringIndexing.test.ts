// keep tests alphabetized by name to match Jest's snapshot ordering
import fs from "fs-extra";
import path from "path";
import { DiagnosticError } from "Shared/errors/DiagnosticError";

import { createTestProject } from "./createTestProject";

function compile(source: string) {
	const project = createTestProject();
	project.vfs.writeFile(
		"/src/stringIndex.d.ts",
		fs.readFileSync(path.join(__dirname, "../src/stringIndex.d.ts"), "utf8"),
	);
	return project.compileSource(source).replace(/^-- Compiled with.*\n/, "");
}

it("captures a receiver before an index call rebinds it", () => {
	expect(
		compile(`
			let value = "abc";
			function index() { value = "xyz"; return 0; }
			export const byte = value[index()];
		`),
	).toMatchSnapshot();
});

it("checks dynamic byte indices without capturing parameters", () => {
	expect(compile("export function read(value: string, index: number) { return value[index]; }")).toMatchSnapshot();
});

it("converts numeric string keys", () => {
	expect(
		compile(`
			export function read(value: string, index: "0" | "1") { return value[index]; }
			export const first = "abc"["0"];
		`),
	).toMatchSnapshot();
});

it("evaluates a receiver before index prerequisites", () => {
	expect(
		compile(`
			declare function value(): string;
			let index = 0;
			export const byte = value()[index++];
		`),
	).toMatchSnapshot();
});

it("evaluates effectful receiver and index calls once", () => {
	expect(
		compile(`
			declare function value(): string;
			declare function index(): number;
			export const byte = value()[index()];
		`),
	).toMatchSnapshot();
});

it("folds invalid literal indices while preserving receiver effects", () => {
	expect(
		compile(`
			declare function value(): string;
			export const negative = value()[-2];
			export const fractional = value()[0.5];
		`),
	).toMatchSnapshot();
});

it("keeps string indexing prerequisites inside optional chains", () => {
	expect(
		compile(`
			declare function index(): number;
			export function read(value: string | undefined) { return value?.[index()]; }
		`),
	).toMatchSnapshot();
});

it("preserves effects when an indexed value is discarded", () => {
	expect(
		compile(`
			declare function value(): string;
			declare function index(): number;
			value()[index()];
		`),
	).toMatchSnapshot();
});

it("rejects indexing a union of strings and arrays", () => {
	expect(() => compile("export function read(value: string | Array<string>) { return value[0]; }")).toThrow(
		DiagnosticError,
	);
});

it("reuses one string iterator for bindings and rest", () => {
	expect(compile('export const [first, , third = "fallback", ...rest] = "abc";')).toMatchSnapshot();
});

it("uses byte indexing for numeric object destructuring keys", () => {
	expect(
		compile(`
			declare const value: string;
			export const { 0: first, "1": second, 5: missing = "fallback" } = value;
		`),
	).toMatchSnapshot();
});

it("uses byte offsets for literal indices", () => {
	expect(
		compile(`
			export function read(value: string) { return value[0]; }
			export function readOffset(value: string) { return value[1_0]; }
		`),
	).toMatchSnapshot();
});
