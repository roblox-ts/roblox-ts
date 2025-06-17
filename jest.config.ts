import type { Config } from "jest";

const config: Config = {
	preset: "ts-jest",
	testEnvironment: "node",
	testRegex: "/src/CLI/test\\.ts$",
	modulePathIgnorePatterns: ["<rootDir>/out/"],
	moduleNameMapper: {
		"^(Project|Shared|CLI|TSTransformer)/(.*)$": "<rootDir>/src/$1/$2",
		"^(Project|Shared|CLI|TSTransformer)$": "<rootDir>/src/$1",
	},
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/CLI/**",
		"!src/Project/**",
		"!src/Shared/classes/LogService.ts",
		"!src/TSTransformer/util/getFlags.ts",
		"!src/TSTransformer/util/getKindName.ts",
		"!src/TSTransformer/util/jsx/constants.ts",
	],
	coverageDirectory: "coverage",
	coverageReporters: ["lcov", "text"],
	verbose: true,
	transform: {
		"^.+\\.tsx?$": ["ts-jest", { tsconfig: "src/CLI/tsconfig.json" }],
	},
};

export default config;
