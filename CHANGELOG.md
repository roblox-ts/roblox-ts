## 0.4.0

> 🎉 The entire compiler has been rewritten to improve speed and stability!

- Adds support for null-coalescing operator `??` and optional chaining operators `?.`, `?.[x]`, `?.()`
- Import erasure is now configurable with the tsconfig.json `"importsNotUsedAsValues"` option
- Rojo 6 nested projects are now supported

- **BREAKING CHANGES FROM 0.3.2**
	- String and utf8 functions no longer increment inputs or decrement outputs. Use them like you would in Lua. (WIP)
	- Bitwise operators are now backed by bit32 functions and will always return positive values
	- Spread operator in function calls must be the last argument

## Pre-0.4.0 Changes
Changes prior to 0.4.0 have been removed from this page since the entire compiler was rewritten. To view the legacy change log, [click here](https://github.com/roblox-ts/roblox-ts/blob/0.3.2/CHANGELOG.md).
