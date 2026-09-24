import "./moduleSyntax/sideEffect";
import { effects } from "./moduleSyntax/effects";
import anonymous from "./moduleSyntax/defaultAnonymous";
import DefaultClass from "./moduleSyntax/defaultClass";
import named from "./moduleSyntax/defaultNamed";
import * as directReExport from "./moduleSyntax/quotedDirectReExport";
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
import * as declared from "./moduleSyntax/renamedExport";
import { plain, prototype as prototypeValue, renamedValue } from "./moduleSyntax/renamedExport";
import * as star from "./moduleSyntax/starExport";
import Shape = require("./moduleSyntax/typeExport");
import type TypeOnlyValue = require("./moduleSyntax/typeOnlyValue");
import * as typeOnly from "./moduleSyntax/typeOnlyReExport";

const typed: RenamedType = renamedValue;

export = () => {
	it("should execute imports used only for side effects", () => {
		const shape: Shape = { value: effects.size() };

		expect(shape.value).to.equal(1);
		expect(effects[0]).to.equal("loaded");
	});

	it("should resolve module trees without a regular import", () => {
		let [instance, parts] = $getModuleTree("./moduleSyntax/moduleTree");
		for (const part of parts) {
			instance = instance.WaitForChild(part);
		}
		const module = require(instance as ModuleScript) as { value: number };

		expect(module.value).to.equal(42);
	});

	it("should preserve named and anonymous default exports", () => {
		expect(named()).to.equal(42);
		expect(anonymous()).to.equal(43);
		expect(new DefaultClass().value).to.equal(44);
	});

	it("should re-export values and elide type-only re-exports", () => {
		const value: star.ImplicitType = star.renamedValue;

		expect(value).to.equal(1);
		expect(star.plain).to.equal(2);
		expect("RenamedType" in star).to.equal(false);
		expect("ImplicitType" in star).to.equal(false);
		expect("absent" in star).to.equal(false);
		expect(star.game).to.equal(game);
	});

	it("should initialize exported variables that have no initializer", () => {
		expect(declared.later).to.equal(undefined);
		declared.initializeLater();
		expect(declared.later).to.equal(42);
		expect(prototypeValue).to.equal(42);
	});

	it("should keep runtime export aliases separate from type-only aliases", () => {
		expect(typeOnly.live).to.equal(2);
		expect(typeOnly.read()).to.equal(2);
		expect("hidden" in typeOnly).to.equal(false);
		expect("Value" in typeOnly).to.equal(false);
		expect("default" in typeOnly).to.equal(false);
	});

	it("should resolve dynamic imports", () => {
		const [success, value] = import("./moduleSyntax/renamedExport").await();

		expect(success).to.equal(true);
		assert(success);
		expect(value.plain).to.equal(2);
	});

	it("should support type-only imports and renamed exports", () => {
		const object: TypeOnlyValue = { value: 42 };
		expect(object.value).to.equal(42);
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

	it("should preserve re-export names without renaming", () => {
		const values: { [key: string]: number } = directReExport;
		expect(values[""]).to.equal(5);
		expect(values[string.char(97, 34, 98)]).to.equal(1);
		expect(values[string.char(97, 92, 98)]).to.equal(2);
		expect(values[string.char(97, 92, 98, 39, 34, 99)]).to.equal(4);
		expect(values["end"]).to.equal(6);
		expect(values["line" + string.char(10) + "break"]).to.equal(3);
	});
};
