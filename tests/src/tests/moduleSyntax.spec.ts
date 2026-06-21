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
};
