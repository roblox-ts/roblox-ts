import eslint from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments";
import prettier from "eslint-plugin-prettier/recommended";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
				project: ["./tsconfig.json", "./tsconfig.eslint.json", "./src/*/tsconfig.json"],
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: {
			"simple-import-sort": simpleImportSort,
			"eslint-comments": comments,
		},
		rules: {
			// off
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-empty-interface": "off",
			"@typescript-eslint/no-namespace": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"no-debugger": "off",
			"no-extra-boolean-cast": "off",

			// warn
			"@typescript-eslint/no-unused-expressions": "warn",
			"@typescript-eslint/no-unused-vars": "warn",
			"eslint-comments/disable-enable-pair": ["warn", { allowWholeFile: true }],
			"eslint-comments/no-unused-disable": "warn",
			"eslint-comments/require-description": "warn",
			"no-console": "warn",
			"no-undef-init": "warn",
			"prefer-const": ["warn", { destructuring: "all" }],
			"prettier/prettier": "warn",
			"simple-import-sort/exports": "warn",
			"simple-import-sort/imports": "warn",
			curly: ["warn", "multi-line", "consistent"],

			// error
			"@typescript-eslint/array-type": ["error", { default: "generic", readonly: "generic" }],
			"@typescript-eslint/no-deprecated": "error",
			"@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
			"@typescript-eslint/no-require-imports": "error",
			"no-constant-condition": ["error", { checkLoops: false }],
			"no-restricted-imports": ["error", { patterns: [".*"] }],
		},
	},
	{
		ignores: ["node_modules/", "tests/", "out/", "coverage/", "devlink/", "jest.config.ts"],
	},
);
