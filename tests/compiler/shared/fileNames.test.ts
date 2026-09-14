import ts from "typescript";

afterEach(() => {
	jest.dontMock("typescript");
});

it.each([true, false, undefined])("canonicalizes filenames with filesystem case sensitivity %s", caseSensitive => {
	jest.isolateModules(() => {
		// the playground has no ts.sys; Node hosts provide their filesystem's case sensitivity
		jest.doMock("typescript", () => ({
			...ts,
			sys: caseSensitive === undefined ? undefined : { ...ts.sys, useCaseSensitiveFileNames: caseSensitive },
		}));
		const { getCanonicalFileName } = jest.requireActual<typeof import("Shared/util/getCanonicalFileName")>(
			"Shared/util/getCanonicalFileName",
		);

		const fileName = "/Project/Src/Module.ts";
		expect(getCanonicalFileName(fileName)).toBe(caseSensitive === false ? "/project/src/module.ts" : fileName);
		expect(getCanonicalFileName(getCanonicalFileName(fileName))).toBe(getCanonicalFileName(fileName));
	});
});
