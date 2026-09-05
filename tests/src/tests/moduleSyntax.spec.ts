import {
	"" as empty,
	'a"b' as quote,
	"a\\b" as backslash,
	"a\u005cb" as unicodeBackslash,
	"a\\b'\"c" as mixed,
	end as reserved,
	"line\nbreak" as newline,
} from "./moduleSyntax/quotedExport";
import * as mutable from "./moduleSyntax/quotedMutableExport";
import {
	"local\\key" as localValue,
	'namespace"\\' as namespace,
	're"quoted' as reQuote,
	"re\\slash" as reBackslash,
	"re\\'\"mixed" as reMixed,
} from "./moduleSyntax/quotedReExport";
// type-only import (import type {...}) -> transformImportDeclaration phaseModifier branch
import type { RenamedType } from "./moduleSyntax/renamedExport";
import { plain, renamedValue } from "./moduleSyntax/renamedExport";

const typed: RenamedType = renamedValue;

export = () => {
	it("should support type-only imports and renamed exports", () => {
		expect(typed).to.equal(1);
		expect(renamedValue).to.equal(1);
		expect(plain).to.equal(2);
	});

	it("should preserve string-literal import and export names", () => {
		expect(quote).to.equal(1);
		expect(backslash).to.equal(2);
		expect(unicodeBackslash).to.equal(2);
		expect(newline).to.equal(3);
		expect(mixed).to.equal(4);
		expect(empty).to.equal(5);
		expect(reserved).to.equal(6);
	});

	it("should preserve renamed and namespace re-exports", () => {
		expect(reQuote).to.equal(1);
		expect(reBackslash).to.equal(2);
		expect(reMixed).to.equal(4);
		expect(namespace['a"b']).to.equal(1);
		const values: { [key: string]: number } = namespace;
		expect(values[string.char(97, 34, 98)]).to.equal(1);
		expect(values[string.char(97, 92, 98)]).to.equal(2);
		expect(values["line" + string.char(10) + "break"]).to.equal(3);
		expect(values[string.char(97, 92, 98, 39, 34, 99)]).to.equal(4);
		expect(localValue).to.equal(7);
	});

	it("should preserve string-literal names for mutable exports", () => {
		expect(mutable['a"b']).to.equal(10);
		expect(mutable["a\\b"]).to.equal(20);
		expect(mutable["a\\b'\"c"]).to.equal(30);
		expect(mutable[""]).to.equal(40);
		expect(mutable.increment()).to.equal(104);
		expect(mutable['a"b']).to.equal(11);
		expect(mutable["a\\b"]).to.equal(21);
		expect(mutable["a\\b'\"c"]).to.equal(31);
		expect(mutable[""]).to.equal(41);
	});
};
