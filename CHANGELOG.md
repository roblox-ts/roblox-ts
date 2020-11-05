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
