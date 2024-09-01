import { FlatCompat } from "@eslint/eslintrc";
import eslint from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...compat.extends("plugin:prettier/recommended"),
	prettierConfig,
	{
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
				project: ["./tsconfig.json", "./tsconfig.eslint.json", "./src/*/tsconfig.json"],
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
			prettier: prettierPlugin,
			"simple-import-sort": simpleImportSort,
			"eslint-comments": comments,
		},
		rules: {
			"@typescript-eslint/array-type": [
				"warn",
				{
					default: "generic",
					readonly: "generic",
				},
			],
			"@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
			"@typescript-eslint/no-unused-vars": "warn",
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/no-empty-interface": "off",
			"@typescript-eslint/no-namespace": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-require-imports": "error",
			"@typescript-eslint/no-unused-expressions": "warn",
			"@typescript-eslint/no-deprecated": "warn",
			curly: ["warn", "multi-line", "consistent"],
			"no-constant-condition": ["error", { checkLoops: false }],
			"no-debugger": "off",
			"no-empty": ["error", { allowEmptyCatch: true }],
			"no-extra-boolean-cast": "off",
			"no-undef-init": "error",
			"prefer-const": ["warn", { destructuring: "all" }],
			"eslint-comments/no-unused-disable": "warn",
			"eslint-comments/disable-enable-pair": ["error", { allowWholeFile: true }],
			"eslint-comments/require-description": "warn",
			"prettier/prettier": "warn",
			"simple-import-sort/exports": "warn",
			"simple-import-sort/imports": "warn",
		},
	},
	{
		files: ["src/**/*.ts", "src/**/*.tsx"],
		rules: {
			"no-console": "warn",
			"no-restricted-imports": ["error", { patterns: [".*"] }],
		},
	},
	{
		ignores: ["node_modules/", "tests/", "out/", "coverage/", "devlink/"],
	},
);
