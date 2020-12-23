## 1.0.0-beta.11

- Fixed unit tests :tada:
- Fixed bug with Promise await rejection errors returning arrays instead of single values
- Fixed destructuring occurs out of order in custom iterator code (#1189)
- Compiler will no longer delete `.git` directories in `outDir` (useful for diffing emit!)
- Simplified logic for creating the returned export table at the bottom of files, which fixed a few bugs
- Updated compiler dependencies (+ TypeScript 4.1.3)
- `rbxtsc init` will now output erorr messages for failed commands (#1188)

## 1.0.0-beta.10

- Fixed "bad node_modules" Rojo config error for compiling packages

## 1.0.0-beta.9

- Fixed bug with transformers + pre-emit checks
- Only reparse transformed SourceFiles (#1177)
- Fixed `Set<T>` spread bug
- `rbxtsc init` now uses special npm tags for `@rbxts/compiler-types` to grab the right version
- Synthetic RojoResolver is now based off of `outDir` instead of the project path (node_modules are done with a separate RojoResolver)

## 1.0.0-beta.8

- Fix init command failing to install `@rbxts/compiler-types`

## 1.0.0-beta.7

- Added support for TypeScript Transformer plugins :tada: (#1169)
	- Thanks to fireboltofdeath for implementing this! :pray:
- Added error message for conditional imports (#1168)
- Fixed packages installed while watch mode is running may create broken imports (#1165)
- Added macro for assert, it now uses JS truthiness (`""`, `0`, and `NaN` will now fail assertions)
- Upgraded roblox-lua-promise to v3.1.0

## 1.0.0-beta.6

- Added back `ReadonlyArray.findIndex`

## 1.0.0-beta.5

- **BREAKING CHANGES**
	- Updated internal Promise implementation to [roblox-lua-promise v3.0.1](https://eryn.io/roblox-lua-promise/)
		- Removed static `Promise.spawn` (use `Promise.defer` instead)
		- Removed `Promise.isRejected` (use `Promise.getStatus` + `Promise.Status` instead)
		- Removed `Promise.isResolved` (use `Promise.getStatus` + `Promise.Status` instead)
		- Removed `Promise.isPending` (use `Promise.getStatus` + `Promise.Status` instead)
		- Removed `Promise.isCancelled` (use `Promise.getStatus` + `Promise.Status` instead)
	- String macros no longer increment inputs and outputs
		- Added `--logStringChanges` to help catch these issues
		- The following methods were changed:
			- `string.byte` (first argument is no longer incremented)
			- `string.find` (second argument is no longer incremented)
			- `string.sub` (first two arguments are no longer incremented)
	- Removed the following API:
		- `Array.copyWithin`
		- `Array.splice`
		- `ObjectConstructor.assign`
		- `ObjectConstructor.copy`
		- `ObjectConstructor.deepCopy`
		- `ObjectConstructor.deepEquals`
		- `ObjectConstructor.entries`
		- `ObjectConstructor.fromEntries`
		- `ObjectConstructor.isEmpty`
		- `ObjectConstructor.keys`
		- `ObjectConstructor.values`
		- `ReadonlyArray.concat`
		- `ReadonlyArray.copy`
		- `ReadonlyArray.deepCopy`
		- `ReadonlyArray.deepEquals`
		- `ReadonlyArray.entries`
		- `ReadonlyArray.findIndex`
		- `ReadonlyArray.lastIndexOf`
		- `ReadonlyArray.reduceRight`
		- `ReadonlyArray.reverse`
		- `ReadonlyArray.slice`
		- `ReadonlyArray.toString`
		- `ReadonlyMap.entries`
		- `ReadonlyMap.keys`
		- `ReadonlyMap.toString`
		- `ReadonlyMap.values`
		- `ReadonlySet.difference`
		- `ReadonlySet.intersect`
		- `ReadonlySet.isDisjointWith`
		- `ReadonlySet.isSubsetOf`
		- `ReadonlySet.toString`
		- `ReadonlySet.union`
		- `ReadonlySet.values`
		- `String.endsWith`
		- `String.includes`
		- `String.indexOf`
		- `String.padEnd`
		- `String.padStart`
		- `String.slice`
		- `String.startsWith`
		- `String.trim`
		- `String.trimEnd`
		- `String.trimStart`
		- You can use [@rbxts/object-utils](https://www.npmjs.com/package/@rbxts/object-utils) to replace `Object.*` functions
		- If there's demand, we can add other packages to replace some of these old APIs.
	- Improved method index without call detection (#1146)
	- Fixed functions with overload signatures inside namespaces compile incorrectly (#1162)
	- Fixed bugs relating to default imports

## 1.0.0-beta.4

- Improved Rojo support for packages
- Fixed block comment compiling bug (#1147)
- Added --writeOnlyChanged (temporary flag to fix Rojo issues on MacOS)
- Added unit tests for diagnostics
- Fixed numeric loops not retaining loop variable value (#1145)
- Fixed empty `LuaTuple<T>` destructure assignment causing invalid Luau emit (#1151)
- Fixed JSON module always importing as a "default import" (#1148)

## 1.0.0-beta.3

- **BREAKING CHANGES**
	- `@rbxts/types` has been broken up into two packages: `@rbxts/types` and `@rbxts/compiler-types`.
		- `@rbxts/compiler-types` is versioned based on the compatible compiler version. You should ensure your versions match up. i.e. compiler `1.0.0-beta.3` should use `@rbxts/compiler-types` `1.0.0-beta.3.x`
		- **Version `1.0.410` and later will no longer work with previous 1.0.0 betas!**
		- You should update to the latest beta or revert to the legacy compiler if necessary.

## 1.0.0-beta.2

- Fix Array.unshift return bug
- Fix missing string methods not being recognized as errors at compile time
- Add support for ReadonlyArray.move (#1138)
- Fix bug with single statement else blocks
- Fix playground filesystem issues

## 1.0.0-beta.1

- Added `--usePolling` to indicate that watch mode should use polling instead of fs events
- Fixed symlinks inside node_modules, allowing pnpm and local packages
- Fixed bug with playground imports
- Fixed LuaTuple array destructuring bug (#1117)
- Updated template default.project.json to have sensible default service properties
- Added support for `declare function identity<T>(value: T): T;`, useful for ensuring an expression is a given type!
- Referencing call macros without calling them will now error `print(typeOf)`
- Fixed switch statement rendering bug (#1123)
- Fixed init mode's .vscode formatting settings to include `[typescriptreact]`
- Fixed destructure spread parameters resulting in bad hoisting (#1127)
- Improved JSX emit (#1114)
- Fixed bug where property access expressions were not evalutated in the correct order (#1126)
- Added support for using call spread operator in property call macros (#1112)
	- i.e. `map.set(...x)`
- Optimized function array spread parameters (#1128)
- Added support for all array spread expression types (#1108)
- Added support for all call spread expression types (#1107)
- Added support for ForOf loops with `IterableFunction<LuaTuple<T>>` without destructure
	- i.e. `for (const x of "abc".gmatch("%w")) {}`
- Fixed getChangedSourceFiles.ts crash (#1134)
- Added support for `--logTruthyChanges` flag (#1135)
- Added support for warning diagnostics (#1136)
- Added errors for incorrectly using unions with macros (#1113)
- Added support for emitting `table.create()` instead of `{}` where table size is known (#1119)
- Fixed package resolution bug for symlinked packages
- Fixed watch mode Windows-style path bug

## 1.0.0-beta.0

> 🎉 The entire compiler has been rewritten to improve speed and stability!

After an almost year long effort and with help from a bunch of contributors, I'm excited to release this first beta for 1.0.0.

This new compiler is still missing some features and emit optimizations, but should be usable for testing. Feel free to file an issue if you run into any bugs.

- Import erasure is now configurable with the tsconfig.json `"importsNotUsedAsValues"` option
- Compilation now supports incremental mode with the following two tsconfig.json options:
	- `"incremental": true,`
	- `"tsBuildInfoFile": "out/tsconfig.tsbuildinfo",`
- Rojo 6 nested projects are now supported
- Adds support for null-coalescing operator `??` and optional chaining operators `?.`, `?.[x]`, `?.()`
- Adds support for compound coalescing assignment expressions: `??=`
- Adds support for compound logical assignment expressoins: `&&=` and `||=`

- **BREAKING CHANGES FROM 0.3.2**
	- "isolatedModules" tsconfig.json option can now be omitted.
	- Bitwise operators are now backed by bit32 functions and will always return positive values
	- Spread operator in function calls must be the last argument

## Legacy Changes
Changes prior to 1.0.0-beta.0 have been removed from this page since the entire compiler was rewritten. To view the legacy change log, [click here](https://github.com/roblox-ts/roblox-ts/blob/0.3.2/CHANGELOG.md).
