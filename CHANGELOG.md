## 1.0.0-beta.1

- Fixed bug with playground imports
- Fixed symlinks inside node_modules, allowing pnpm and local packages
- Added `--usePolling` to indicate that watch mode should use polling instead of fs events

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
