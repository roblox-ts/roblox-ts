import type { Config } from "jest";

const config: Config = {
	preset: "ts-jest",
	testEnvironment: "node",
	// leave headroom for compiler watch tests on the smaller macOS runners
	maxWorkers: process.env.GITHUB_ACTIONS === "true" && process.platform === "darwin" ? 2 : "100%",
	workerIdleMemoryLimit: "512MB",
	testMatch: ["<rootDir>/tests/compiler/**/*.test.ts"],
	modulePathIgnorePatterns: ["<rootDir>/out/"],
	moduleNameMapper: {
		"^(Project|Shared|CLI|TSTransformer)/(.*)$": "<rootDir>/src/$1/$2",
		"^(Project|Shared|CLI|TSTransformer)$": "<rootDir>/src/$1",
	},
	collectCoverageFrom: ["src/**/*.ts", "!src/CLI/**", "!src/Shared/classes/LogService.ts"],
	coverageDirectory: "coverage",
	coverageReporters: ["json", "lcov", "text"],
	verbose: true,
	transform: {
		"^.+\\.tsx?$": ["ts-jest", { tsconfig: "tests/compiler/tsconfig.json" }],
	},
};

export default config;
