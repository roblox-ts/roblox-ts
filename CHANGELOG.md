## 3.0.0
- TypeScript dependency updated to 5.5.3 ([#2617][2617], [#2648][2648], [#2716][2716], [#2736][2736])
- Generic JSX ([#2404][2404])
	- JSX can now be used for any library which matches `React.createElement()` syntax
- `--optimizedLoops` flag is now enabled by default
	- this will optimize loops like `for (let i = 1; i <= 10; i++) {}` into `for i = 1, 10 do end`
	- please report any issues [here](https://github.com/roblox-ts/roblox-ts/issues/new)
	- if necessary, you can run the compiler with `--optimizedLoops=false` to return to the old behavior
- Improve emit for `a.b()` and `a[b]()` ([#2623][2623])
- Fixed bug where `noMacroExtends` diagnostic would never be reported ([#2587][2587])
- Fixed bug where `noRobloxSymbolInstanceof` diagnostic would not always be reported ([#2672][2672])
- Fixed watch mode error for files with "unsupported extensions" ([#2701][2701])
- Fixed multiline template string bug on Windows ([roblox-ts/luau-ast#483][roblox-ts/luau-ast#483])
- Fixed template string unicode escape sequence bug ([roblox-ts/luau-ast#483][roblox-ts/luau-ast#483])
- Fixed optional arguments when spreading into macro ([#2528][2528])
- Fixed nested classes not getting hoisted ([#2728][2728])
- Pinned exact versions of @roblox-ts dependencies ([#2724][2724])
- Fixed bug where error was not rethrown after a `finally` block ([#2726][2726])
- Fixed bug where `finally` block was not run if the `catch` block errored ([#2726][2726])
- Fixed importing directories that are symlinked twice ([#2704][2704])
- Moved all `@types/*` to devDependencies ([#2737][2737])
- Corrected parameter decorator name argument ([#2460][2460])
- Corrected decorator execution ordering ([#2759][2759])
- Fixed `export {}` not working on imported variables ([#2796][2796])
- Fixed statements before super breaking class initialization ([#2778][2778])
- Fixed internal transformPaths transformer ([#2800][2800])
- Added support for `.luau` file extension ([#2802][2802])
- Fix typo in issue #1149's diagnostic ([#2649][2649])
- Added an error if `types` is not found in tsconfig.json ([#2533][2533])

### **Breaking Changes**
- To continue using `@rbxts/roact` + JSX
	- roblox-ts 3.0.0+ will require `@rbxts/roact` 3.0.1+
	- Class components must be tagged with `@Roact.ClassComponent`
	- Top-level JSX expressions no longer support `Key`. To preserve previous behavior, you should wrap it in a fragment:
		```tsx
		<><screengui Key="ScreenGui" /></>
		```
	- In `tsconfig.json` you should set the following
		```json
		"jsx": "react",
		"jsxFactory": "Roact.jsx",
		"jsxFragmentFactory": "Roact.Fragment",
		```
- Upgraded bundled `roblox-lua-promise` from 3.2.1 to 4.0.0. See possible breaking changes [here](https://github.com/evaera/roblox-lua-promise/releases).
- The TypeScript update includes a few edge-case breaking changes: [5.4](https://devblogs.microsoft.com/typescript/announcing-typescript-5-4/#notable-behavioral-changes8) and [5.5](https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/#notable-behavioral-changes30)
- roblox-ts will emit compiled files as `.luau` by default. You can keep the old behaviour by running with `--luau=false`.
- Parameter decorators will now be called with the name of the method, instead of the name of the parameter. This matches TypeScript behaviour.

## 2.3.0
- Removed `rbxtsc init` in favor of `npm create roblox-ts` ([#2503][2503])
- Lune Unit Testing ([#2489][2489])
	- Not user facing, but the compiler should be more stable going forwards! :tada:
- Removed enum inverse mapping for string values ([#2506][2506])
- $range macro optimizations ([#2130][2130], [#2196][2196])
- Added support for `typeIs(value, "buffer")` ([#2588][2588])
- Fixed `Array.push()` inserting multiple values for different tables ([#2597][2597])
- Support interpolated string emit for template expressions ([#2591][2591])
- Removed unnecessary parentheses for chained binary expressions like `a && b && c` ([#2242][2242])
- Better usage analysis for function expressions + `...` ([#2527][2527])
- Fixed `noAny` diagnostic for `a.b()` and `a[b]()` ([#2550][2550])
- Optimized array offset emit so that `x[n - 1]` becomes `x[n]` instead of `x[n - 1 + 1]` ([#2567][2567])
- Optimized object spread assignment when the spread is the first entry in the object, i.e. `{ ...obj, foo: "bar" }` ([#2546][2546])
- Fixed bug related to `new Map( ... ).delete(exp)` and `new Set( ... ).delete(exp)` ([#2605][2605])
- Split off PathTranslator class into it's own package ([#2614][2614])
- Added support integer division operator via macro: `Number.idiv()`, `Vector2.idiv()`, and `Vector3.idiv()` ([#2606][2606])
	- these compile to `a // b`
	- number literals should be wrapped in parentheses, i.e. `(10).idiv(3)`

## 2.2.0
- TypeScript 5.2.2 Support ([#2401][2401], [#2466][2466])
- Support for instantiated expressions ([#2445][2445])
- Support for Luau comment directives like `//!native` ([#2465][2465])
- Fixed incorrect emit with `array[n]?.()` ([#2475][2475])
- Support for class static blocks ([#2480][2480])

## 2.1.1
- Enable `--optimizedLoops` flag for Playground environment ([#2271][2271])
- Fix for updating non-compiled files in transformer watch mode ([#2385][2385])
- Add `$getModuleTree` macro ([#2302][2302])

## 2.1.0
- TypeScript 4.9 Support ([#2195][2195])
	- Adds support for `satisfies` keyword
	- Adds disagnostic for the `accessor` keyword (requires getters/setters which are not supported)
- Removed diagnostic for comma operator ([#2045][2045])
- Banned instanceof on roblox types ([#2225][2225])
- Disabled networkType check for dynamic import() ([#2197][2197])
- Added `--writeTransformedFiles` to write transformed TypeScript ASTs to out directory ([#2255][2255])
- Small improvements and fixes for `--optimizedLoops` ([#2201][2201], [#2265][2265])

## 2.0.4
- Updated deprecated APIs for TS 4.8 ([#2143][2143])

## 2.0.3
- Fixed new regression with incremental mode ([#2138][2138])

## 2.0.2
- Fixed new regression with Playground environment

## 2.0.1
- Fixed new regression with Package projects importing package dependencies ([#2125][2125])

## 2.0.0
- **Breaking Changes**
	- Removed `opcall` in favor of `pcall` ([#1991][1991])
	- Removed `PKG_VERSION` in favor of a transformer plugin ([#1990][1990])
	- Improved npm module resolution ([#2011][2011])
	- Fix incorrect right shift implementation ([#2069][2069])
- **Other Changes**
	- Fixed bug with `Array.unorderedRemove` for `false` values ([#1883][1883])
	- Added support for `preserveConstEnums` tsconfig.json option ([#1894][1894])
	- Upgraded to TypeScript 4.8.3 ([#1903][1903], [#2121][2121])
	- Fixed a bug with `type` keyword and named exports ([#1922][1922])
	- Improved JSX config error messages ([#1817][1817])
	- Improved detection of Roact Change/Event attributes ([#1972][1972])
	- Improved naming of for-of statement temporary identifiers ([#1896][1896])
	- Added experimental compiler flag `--optimizedLoops` to compile some numeric for loops to be Lua for loops ([#1977][1977])
	- Fixed duplicate diagnostics for enum and namespace merging ([#1981][1981])
	- Added `$range` macro ([#1979][1979])
	- Added `$tuple` macro ([#1980][1980])
	- Optimized array destructuring from array literal ([#1994][1994])
	- Added support for `import K = X.Y.Z;` ([#2001][2001])
	- Emit no longer uses `pairs()`/`ipairs()`, in favor of generalized iteration ([#2008][2008])
	- Added diagnostic for non-Server .ts files importing Server .ts files ([#1899][1899])
	- Fixed `npm init` package manager detection bug
	- Fixed `npm init` not properly exiting on Ctrl+C
	- Fixed `npm init` existing path recognition ([#2019][2019])
	- Prevent compiler from crashing when identifiers have no symbol ([#1987][1987])
	- Improved support for compiler build flags in `"rbxts"` field of `tsconfig.json` ([#2023][2023])
	- Banned usage of `@ts-ignore` and add --allowCommentDirectives ([#2024][2024])
	- Improved `rbxtsc init plugin` template to use "types" in tsconfig.json instead of triple slash directives ([#2028][2028])
	- Fixed `rbxtsc init` usage with pnpm ([#2060][2060])

## 1.3.3
- Fixed some regressions for compiling void-returning macros as expressions ([#1864][1864], [#1876][1876])
- Improved validation for  `tsconfig.json` `"typeRoots"` field ([#1873][1873])
- Fixed a crash when referencing global const enums in the same file they're declared in ([#1878][1878])

## 1.3.2
- `Array.push` now optimizes to use `table.insert()`
- Macro emit is no longer wrapped in comments for single statements
- null coalescing expressions can now be inlined if Lua truthiness allows ([#1857][1857])
- Fixed conditional expression usage inside for loops ([#1856][1856])

## 1.3.1
- Added "experimentalDecorators" tsconfig.json option to templates + playground ([#1850][1850])

## 1.3.0
- Split out compiler parts into multiple packages ([#1775][1775])
- Fixed broken hoisting on arrow function variables ([#1777][1777])
- Improved emit for expression statement ternaries ([#1783][1783])
- Improved watch mode stability ([#1787][1787])
- Loosened "any" type checks to allow for improved usage with type variables
- Improved support for object destructuring assignment ([#1822][1822])
- `rbxtsc init` will no longer prompt for `git init` if git isn't installed ([#1823][1823])
- Fix `LuaTuple<T>` wrapping in for loop condition ([#1819][1819])
- Added initial support for TypeScript decorators :tada: ([#1793][1793])
- Bumped TypeScript version to 4.5.5

## 1.2.9
- Upgraded built-in roblox-lua-promise to v3.2.1
- Improved incremental mode to recognize tsconfig.json "plugins"
- Package template from `rbxtsc init` now ignores `.tsbuildinfo` files when uploading to npm
- Fixed compiler crash when calling Roblox API methods via element expression `game["Destroy"]()` ([#1761][1761])
- Fixed Luau if-expression truthiness bug ([#1762][1762])
- Fixed Luau if-expression precedence bug ([#1763][1763])

## 1.2.8
- Added `ignorePatterns` to `rbxtsc init` eslint config
- Improved diagnostic for assignment of methods and non-methods to one another ([#1667][1667])
- Added support for Luau if-expressions in emit ([#1675][1675])
- Improved watch mode not recompiling after errors ([#1682][1682])
- Added warning for transformers failing to initialize ([#1683][1683])
- Improved JSX tsconfig.json errors to allow for custom JSX transformers ([#1690][1690])
- Allowed for method indexing in `typeIs()` macro calls ([#1696][1696])
- Removed `"baseUrl"` setting from `rbxtsc init package` tsconfig.json template
- Fixed error with export * from .d.ts file ([#1727][1727])
- Fixed double `not` keywords in do-while with negated condition ([#1749][1749])
- Reworked the internals for `rbxtsc init`, added use of prettier without eslint ([#1659][1659])
- Incremental mode now considers `--type` flag

## 1.2.7
- Fixed roblox-ts pre-emit diagnostics being reported before TypeScript pre-emit diagnostics ([#1663][1663])
- Fixed regression with `...args` in built-in functions that support var args ([#1665][1665])

## 1.2.6
- Fixed regression with using `defined`/`unknown` values in string templates ([#1652][1652])
- Added method assignment validation diagnostics ([#1651][1651])

## 1.2.5
- Fixed playground crash ([#1648][1648])

## 1.2.4
- Improved temporary identifier names in a few cases
- Small optimization for macros with defaults ([#1521][1521])
- Fixed binary expression equal precedence issues ([#1538][1538])
- Skip rendering parentheses for literals / simple expressions ([#1543][1543])
- Fixed emitted type declarations with transformers ([#1557][1557])
- Fixed enum hoisting ([#1555][1555])
- Fixed namespace bugs ([#1563][1563])
- Fixed template literal infinite recursion bug ([#1564][1564])
- Improved incremental mode hash generation ([#1589][1589])
- Improved detection for `defined` type
- Improvements for watch mode ([#1520][1520])
- Improved testing and code coverage :tada:
- Fixed crash with for-of loops over `pairs(this)` ([#1629][1629])

## 1.2.3
- Fixed a bug with array spread expressions like `[a, ...b]`
- Fixed playground environment crash

## 1.2.2
- Fixed a bug with temporary identifiers shadowing each other incorrectly.

## 1.2.1
- Add contextual info to the 'noRojoData' diagnostic ([#1354][1354])
- Fixed LuaTuples don't compile correctly with optional chaining ([#1338][1338])
- Added compiler warnings for using the RuntimeLib from ReplicatedFirst
- Improved `LuaTuple<T>` detection ([#1356][1356])
- Added support for tsconfig.json `"extends"` with transformer plugins ([#1357][1357])
- Added default "build" and "watch" scripts to `rbxtsc init` package.json files
- Added check against merging functions and namespaces, fixed bug where `declare` declarations were incorrectly seen as "merging".
- Improved detection of `defined` type.
- Added support for diagnostics emitted from transformer plugins ([#1387][1387])
- Added support for `typeIs(v, "vector")`
- Added diagnostic for use of reserved fields `"new"` and `"__index"` in class declarations
- Reworked ForStatement emit to handle complex cases better ([#1315][1315])
- Added package manager selection to `rbxtsc init` ([#1346][1346])
- Removed `--logStringChanges` flag
- Added support for variable assignments in for..of loops ([#1253][1253])
- Added support for "named" temporary identifiers (used internally by the compiler) to make the emit more readable ([#1382][1382])
- Fixed crash on iteration over `WeakSet<T>` and `WeakMap<K, V>` ([#1417][1417])
- Improved performance for transformer plugins ([#1416][1416])
- `rbxtsc-dev` now force disables incremental mode for compiler development ([#1420][1420])
- Fixed watch mode dependency bugs without incremental mode ([#1424][1424])
- Added `serve.project.json` to `rbxtsc init plugin` template ([#1419][1419])
- Array spread now uses `table.move()` ([#1437][1437])
- noAny diagnostic will now only be reported once per symbol ([#1435][1435])
- Fixed Luau emit bug with multiline strings used as table keys ([#1453][1453])
- Added support for `return` in class constructors ([#1455][1455])
- Fixed Luau emit bug with strings containing `'`, `"`, and ending in `]` ([#1467][1467])
- Added support for alternative npm scopes other than `@rbxts` :tada: ([#1474][1474])
- Added a friendly notice for when `git init` fails in `rbxtsc init` initialization step ([#1477][1477])
- Fixed `init.lua` files being incorrectly deleted in watch mode
- Cleaned out old and unused `RuntimeLib.lua` functions
- Added `"forceConsistentCasingInFileNames": true,` to `rbxtsc init` tsconfig.json files
- Fixed `rbxtsc init` under `@next` builds ([#1479][1479])
- Fixed `.d.ts` files not being deleted in watch mode ([#1445][1445])
- Added diagnostic for `init` being reserved in Roact.Component classes ([#1454][1454])
- `instanceof` emit now uses RuntimeLib function `TS.instanceof()` ([#1491][1491])
- Fixed bug where `"include"` folder was copied for package projects

## 1.1.1

- Fixed crash when using `@rbxts/roact` in the playground

## 1.1.0

- Reorganized `@rbxts/roact` types and improved compiler support for detecting the types
	- `@rbxts/roact@>=1.3.0-ts.13` requires `roblox-ts@>=1.1.0`
- `Array.includes()` now compiles to a `table.find()` call ([#1299][1299])
- `.d.ts` files are no longer copied to `out` directory if tsconfig.json "declaration" setting is not enabled
- Fixed switch statement bug with missing parentheses ([#1304][1304])
- Fixed `export * as N` bug ([#1320][1320])
- Fixed expressions with prereqs / macros in "else if" conditions not compiling correctly ([#1314][1314])
- Globals used by the compiler (`type()`, `typeof()`, `table`, etc.) will now error if shadowed by a variable or parameter name
- Fixed macro math order of operations bugs

## 1.0.0

- Updated to TypeScript 4.2.3
- Updated "out of date of types" error message text
- Added a diagnostic for ([#1149][1149])
- Fixed JSX fragments used as children ([#1285][1285])
- Updated `rbxtsc init package` to use package.json "files"
- Updated `rbxtsc init` to use default.project.json "globIgnorePaths"
- Fixed JSX fragments in playground environment
- Fixed export tables for "declared" identifiers

## 1.0.0-beta.17

- Fixed error message text for when `@rbxts/compiler-types` is out of date
- Added a diagnostic error for ([#1149][1149])
- Fixed using a JSX fragment as a child ([#1285][1285])
- Updated `rbxtsc init` to use `"files"` in package.json for packages
- Added a default `"globIgnorePaths"` setting to default.project.json files for `rbxtsc init`
- Fixed JSX fragment support in the playground environment
- Disallowed usage of unary `-` on non-number types ([#1288][1288])
- `Array.unorderedRemove` now checks to see if the input is within the array's range.
- Added a diagnostic for iterating over `Iterable<T>` directly ([#1202][1202])

## 1.0.0-beta.16

- Compiler will now warn if any input files will result in an output collision ([#1254][1254])
- Fixed generator methods not properly compiling ([#1243][1243])
- Fixed numeric for loops not creating internal variable after condition check with prerequisite statements ([#1250][1250])
- Fixed bugs relating to calling "super" methods ([#1266][1266])
- Added `Array<T>.clear()`

## 1.0.0-beta.15

- Added support for JSX Fragment Shorthand Expressions `<><frame/></>`
- Fixed iterating over an IterableFunction without destructuring ([#1215][1215])
- Fixed `array | undefined` index not being incremented ([#1226][1226])
- Fixed wrap return if LuaTuple in optional call ([#1227][1227])
- Fixed JSX map expressions replacing children bug
- Add project package.json version into hashing for incremental mode

## 1.0.0-beta.14

- Compiler now exits with exit code 1 if there are any error diagnostics (This was a bug from the new diagnostic system)
- Added new roblox-ts VSCode extension to `.vscode/extensions.json` file
- Improved `rbxtsc init` support for config flags + `-y`
- Banned macro classes being used in object spreads ([#1206][1206])
- Added support for array literals with omitted expressions ([#1207][1207])
- Fixed bug with for-statements ending with `continue` ([#1208][1208])

## 1.0.0-beta.13

- Added dynamic import expression support ([#1203][1203]) `import("./module").then(({ x }) => print(x));`
- Fixed bug with transformers + macros introduced in beta.12 ([#1204][1204])

## 1.0.0-beta.12

- Added checks against variables named `_N` (where `N` is a number) and `TS`. These are used internally by the compiler
	- In the future, we'll add a system that works around this
- Fixed a performance issue for compiling transformers where type checking work was duplicated
- Exposed new VirtualProject APIs for improved playground support

## 1.0.0-beta.11

- Fixed unit tests :tada:
- Fixed bug with Promise await rejection errors returning arrays instead of single values
- Fixed destructuring occurs out of order in custom iterator code ([#1189][1189])
- Compiler will no longer delete `.git` directories in `outDir` (useful for diffing emit!)
- Simplified logic for creating the returned export table at the bottom of files, which fixed a few bugs
- Updated compiler dependencies (+ TypeScript 4.1.3)
- `rbxtsc init` will now output error messages for failed commands ([#1188][1188])

## 1.0.0-beta.10

- Fixed "bad node_modules" Rojo config error for compiling packages

## 1.0.0-beta.9

- Fixed bug with transformers + pre-emit checks
- Only reparse transformed SourceFiles ([#1177][1177])
- Fixed `Set<T>` spread bug
- `rbxtsc init` now uses special npm tags for `@rbxts/compiler-types` to grab the right version
- Synthetic RojoResolver is now based off of `outDir` instead of the project path (node_modules are done with a separate RojoResolver)

## 1.0.0-beta.8

- Fix init command failing to install `@rbxts/compiler-types`

## 1.0.0-beta.7

- Added support for TypeScript Transformer plugins :tada: ([#1169][1169])
	- Thanks to fireboltofdeath for implementing this! :pray:
- Added error message for conditional imports ([#1168][1168])
- Fixed packages installed while watch mode is running may create broken imports ([#1165][1165])
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
	- Improved method index without call detection ([#1146][1146])
	- Fixed functions with overload signatures inside namespaces compile incorrectly ([#1162][1162])
	- Fixed bugs relating to default imports

## 1.0.0-beta.4

- Improved Rojo support for packages
- Fixed block comment compiling bug ([#1147][1147])
- Added --writeOnlyChanged (temporary flag to fix Rojo issues on MacOS)
- Added unit tests for diagnostics
- Fixed numeric loops not retaining loop variable value ([#1145][1145])
- Fixed empty `LuaTuple<T>` destructure assignment causing invalid Luau emit ([#1151][1151])
- Fixed JSON module always importing as a "default import" ([#1148][1148])

## 1.0.0-beta.3

- **BREAKING CHANGES**
	- `@rbxts/types` has been broken up into two packages: `@rbxts/types` and `@rbxts/compiler-types`.
		- `@rbxts/compiler-types` is versioned based on the compatible compiler version. You should ensure your versions match up. i.e. compiler `1.0.0-beta.3` should use `@rbxts/compiler-types` `1.0.0-beta.3.x`
		- **Version `1.0.410` and later will no longer work with previous 1.0.0 betas!**
		- You should update to the latest beta or revert to the legacy compiler if necessary.

## 1.0.0-beta.2

- Fix Array.unshift return bug
- Fix missing string methods not being recognized as errors at compile time
- Add support for ReadonlyArray.move ([#1138][1138])
- Fix bug with single statement else blocks
- Fix playground filesystem issues

## 1.0.0-beta.1

- Added `--usePolling` to indicate that watch mode should use polling instead of fs events
- Fixed symlinks inside node_modules, allowing pnpm and local packages
- Fixed bug with playground imports
- Fixed LuaTuple array destructuring bug ([#1117][1117])
- Updated template default.project.json to have sensible default service properties
- Added support for `declare function identity<T>(value: T): T;`, useful for ensuring an expression is a given type!
- Referencing call macros without calling them will now error `print(typeOf)`
- Fixed switch statement rendering bug ([#1123][1123])
- Fixed init mode's .vscode formatting settings to include `[typescriptreact]`
- Fixed destructure spread parameters resulting in bad hoisting ([#1127][1127])
- Improved JSX emit ([#1114][1114])
- Fixed bug where property access expressions were not evalutated in the correct order ([#1126][1126])
- Added support for using call spread operator in property call macros ([#1112][1112])
	- i.e. `map.set(...x)`
- Optimized function array spread parameters ([#1128][1128])
- Added support for all array spread expression types ([#1108][1108])
- Added support for all call spread expression types ([#1107][1107])
- Added support for ForOf loops with `IterableFunction<LuaTuple<T>>` without destructure
	- i.e. `for (const x of "abc".gmatch("%w")) {}`
- Fixed getChangedSourceFiles.ts crash ([#1134][1134])
- Added support for `--logTruthyChanges` flag ([#1135][1135])
- Added support for warning diagnostics ([#1136][1136])
- Added errors for incorrectly using unions with macros ([#1113][1113])
- Added support for emitting `table.create()` instead of `{}` where table size is known ([#1119][1119])
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

<!-- REFERENCE LINKS -->

[1107]: https://github.com/roblox-ts/roblox-ts/pull/1107
[1108]: https://github.com/roblox-ts/roblox-ts/pull/1108
[1112]: https://github.com/roblox-ts/roblox-ts/pull/1112
[1113]: https://github.com/roblox-ts/roblox-ts/pull/1113
[1114]: https://github.com/roblox-ts/roblox-ts/pull/1114
[1117]: https://github.com/roblox-ts/roblox-ts/pull/1117
[1119]: https://github.com/roblox-ts/roblox-ts/pull/1119
[1123]: https://github.com/roblox-ts/roblox-ts/pull/1123
[1126]: https://github.com/roblox-ts/roblox-ts/pull/1126
[1127]: https://github.com/roblox-ts/roblox-ts/pull/1127
[1128]: https://github.com/roblox-ts/roblox-ts/pull/1128
[1134]: https://github.com/roblox-ts/roblox-ts/pull/1134
[1135]: https://github.com/roblox-ts/roblox-ts/pull/1135
[1136]: https://github.com/roblox-ts/roblox-ts/pull/1136
[1138]: https://github.com/roblox-ts/roblox-ts/pull/1138
[1145]: https://github.com/roblox-ts/roblox-ts/pull/1145
[1146]: https://github.com/roblox-ts/roblox-ts/pull/1146
[1147]: https://github.com/roblox-ts/roblox-ts/pull/1147
[1148]: https://github.com/roblox-ts/roblox-ts/pull/1148
[1149]: https://github.com/roblox-ts/roblox-ts/pull/1149
[1151]: https://github.com/roblox-ts/roblox-ts/pull/1151
[1162]: https://github.com/roblox-ts/roblox-ts/pull/1162
[1165]: https://github.com/roblox-ts/roblox-ts/pull/1165
[1168]: https://github.com/roblox-ts/roblox-ts/pull/1168
[1169]: https://github.com/roblox-ts/roblox-ts/pull/1169
[1177]: https://github.com/roblox-ts/roblox-ts/pull/1177
[1188]: https://github.com/roblox-ts/roblox-ts/pull/1188
[1189]: https://github.com/roblox-ts/roblox-ts/pull/1189
[1202]: https://github.com/roblox-ts/roblox-ts/pull/1202
[1203]: https://github.com/roblox-ts/roblox-ts/pull/1203
[1204]: https://github.com/roblox-ts/roblox-ts/pull/1204
[1206]: https://github.com/roblox-ts/roblox-ts/pull/1206
[1207]: https://github.com/roblox-ts/roblox-ts/pull/1207
[1208]: https://github.com/roblox-ts/roblox-ts/pull/1208
[1215]: https://github.com/roblox-ts/roblox-ts/pull/1215
[1226]: https://github.com/roblox-ts/roblox-ts/pull/1226
[1227]: https://github.com/roblox-ts/roblox-ts/pull/1227
[1243]: https://github.com/roblox-ts/roblox-ts/pull/1243
[1250]: https://github.com/roblox-ts/roblox-ts/pull/1250
[1253]: https://github.com/roblox-ts/roblox-ts/pull/1253
[1254]: https://github.com/roblox-ts/roblox-ts/pull/1254
[1266]: https://github.com/roblox-ts/roblox-ts/pull/1266
[1285]: https://github.com/roblox-ts/roblox-ts/pull/1285
[1288]: https://github.com/roblox-ts/roblox-ts/pull/1288
[1299]: https://github.com/roblox-ts/roblox-ts/pull/1299
[1304]: https://github.com/roblox-ts/roblox-ts/pull/1304
[1314]: https://github.com/roblox-ts/roblox-ts/pull/1314
[1315]: https://github.com/roblox-ts/roblox-ts/pull/1315
[1320]: https://github.com/roblox-ts/roblox-ts/pull/1320
[1338]: https://github.com/roblox-ts/roblox-ts/pull/1338
[1346]: https://github.com/roblox-ts/roblox-ts/pull/1346
[1354]: https://github.com/roblox-ts/roblox-ts/pull/1354
[1356]: https://github.com/roblox-ts/roblox-ts/pull/1356
[1357]: https://github.com/roblox-ts/roblox-ts/pull/1357
[1382]: https://github.com/roblox-ts/roblox-ts/pull/1382
[1387]: https://github.com/roblox-ts/roblox-ts/pull/1387
[1416]: https://github.com/roblox-ts/roblox-ts/pull/1416
[1417]: https://github.com/roblox-ts/roblox-ts/pull/1417
[1419]: https://github.com/roblox-ts/roblox-ts/pull/1419
[1420]: https://github.com/roblox-ts/roblox-ts/pull/1420
[1424]: https://github.com/roblox-ts/roblox-ts/pull/1424
[1435]: https://github.com/roblox-ts/roblox-ts/pull/1435
[1437]: https://github.com/roblox-ts/roblox-ts/pull/1437
[1445]: https://github.com/roblox-ts/roblox-ts/pull/1445
[1453]: https://github.com/roblox-ts/roblox-ts/pull/1453
[1454]: https://github.com/roblox-ts/roblox-ts/pull/1454
[1455]: https://github.com/roblox-ts/roblox-ts/pull/1455
[1467]: https://github.com/roblox-ts/roblox-ts/pull/1467
[1474]: https://github.com/roblox-ts/roblox-ts/pull/1474
[1477]: https://github.com/roblox-ts/roblox-ts/pull/1477
[1479]: https://github.com/roblox-ts/roblox-ts/pull/1479
[1491]: https://github.com/roblox-ts/roblox-ts/pull/1491
[1520]: https://github.com/roblox-ts/roblox-ts/pull/1520
[1521]: https://github.com/roblox-ts/roblox-ts/pull/1521
[1538]: https://github.com/roblox-ts/roblox-ts/pull/1538
[1543]: https://github.com/roblox-ts/roblox-ts/pull/1543
[1555]: https://github.com/roblox-ts/roblox-ts/pull/1555
[1557]: https://github.com/roblox-ts/roblox-ts/pull/1557
[1563]: https://github.com/roblox-ts/roblox-ts/pull/1563
[1564]: https://github.com/roblox-ts/roblox-ts/pull/1564
[1589]: https://github.com/roblox-ts/roblox-ts/pull/1589
[1629]: https://github.com/roblox-ts/roblox-ts/pull/1629
[1648]: https://github.com/roblox-ts/roblox-ts/pull/1648
[1651]: https://github.com/roblox-ts/roblox-ts/pull/1651
[1652]: https://github.com/roblox-ts/roblox-ts/pull/1652
[1659]: https://github.com/roblox-ts/roblox-ts/pull/1659
[1663]: https://github.com/roblox-ts/roblox-ts/pull/1663
[1665]: https://github.com/roblox-ts/roblox-ts/pull/1665
[1667]: https://github.com/roblox-ts/roblox-ts/pull/1667
[1675]: https://github.com/roblox-ts/roblox-ts/pull/1675
[1682]: https://github.com/roblox-ts/roblox-ts/pull/1682
[1683]: https://github.com/roblox-ts/roblox-ts/pull/1683
[1690]: https://github.com/roblox-ts/roblox-ts/pull/1690
[1696]: https://github.com/roblox-ts/roblox-ts/pull/1696
[1727]: https://github.com/roblox-ts/roblox-ts/pull/1727
[1749]: https://github.com/roblox-ts/roblox-ts/pull/1749
[1761]: https://github.com/roblox-ts/roblox-ts/pull/1761
[1762]: https://github.com/roblox-ts/roblox-ts/pull/1762
[1763]: https://github.com/roblox-ts/roblox-ts/pull/1763
[1775]: https://github.com/roblox-ts/roblox-ts/pull/1775
[1777]: https://github.com/roblox-ts/roblox-ts/pull/1777
[1783]: https://github.com/roblox-ts/roblox-ts/pull/1783
[1787]: https://github.com/roblox-ts/roblox-ts/pull/1787
[1793]: https://github.com/roblox-ts/roblox-ts/pull/1793
[1817]: https://github.com/roblox-ts/roblox-ts/pull/1817
[1819]: https://github.com/roblox-ts/roblox-ts/pull/1819
[1822]: https://github.com/roblox-ts/roblox-ts/pull/1822
[1823]: https://github.com/roblox-ts/roblox-ts/pull/1823
[1850]: https://github.com/roblox-ts/roblox-ts/pull/1850
[1856]: https://github.com/roblox-ts/roblox-ts/pull/1856
[1857]: https://github.com/roblox-ts/roblox-ts/pull/1857
[1864]: https://github.com/roblox-ts/roblox-ts/pull/1864
[1873]: https://github.com/roblox-ts/roblox-ts/pull/1873
[1876]: https://github.com/roblox-ts/roblox-ts/pull/1876
[1878]: https://github.com/roblox-ts/roblox-ts/pull/1878
[1883]: https://github.com/roblox-ts/roblox-ts/pull/1883
[1894]: https://github.com/roblox-ts/roblox-ts/pull/1894
[1896]: https://github.com/roblox-ts/roblox-ts/pull/1896
[1899]: https://github.com/roblox-ts/roblox-ts/pull/1899
[1903]: https://github.com/roblox-ts/roblox-ts/pull/1903
[1922]: https://github.com/roblox-ts/roblox-ts/pull/1922
[1972]: https://github.com/roblox-ts/roblox-ts/pull/1972
[1977]: https://github.com/roblox-ts/roblox-ts/pull/1977
[1979]: https://github.com/roblox-ts/roblox-ts/pull/1979
[1980]: https://github.com/roblox-ts/roblox-ts/pull/1980
[1981]: https://github.com/roblox-ts/roblox-ts/pull/1981
[1987]: https://github.com/roblox-ts/roblox-ts/pull/1987
[1990]: https://github.com/roblox-ts/roblox-ts/pull/1990
[1991]: https://github.com/roblox-ts/roblox-ts/pull/1991
[1994]: https://github.com/roblox-ts/roblox-ts/pull/1994
[2001]: https://github.com/roblox-ts/roblox-ts/pull/2001
[2008]: https://github.com/roblox-ts/roblox-ts/pull/2008
[2011]: https://github.com/roblox-ts/roblox-ts/pull/2011
[2019]: https://github.com/roblox-ts/roblox-ts/pull/2019
[2023]: https://github.com/roblox-ts/roblox-ts/pull/2023
[2024]: https://github.com/roblox-ts/roblox-ts/pull/2024
[2028]: https://github.com/roblox-ts/roblox-ts/pull/2028
[2045]: https://github.com/roblox-ts/roblox-ts/pull/2045
[2060]: https://github.com/roblox-ts/roblox-ts/pull/2060
[2069]: https://github.com/roblox-ts/roblox-ts/pull/2069
[2121]: https://github.com/roblox-ts/roblox-ts/pull/2121
[2125]: https://github.com/roblox-ts/roblox-ts/pull/2125
[2130]: https://github.com/roblox-ts/roblox-ts/pull/2130
[2138]: https://github.com/roblox-ts/roblox-ts/pull/2138
[2143]: https://github.com/roblox-ts/roblox-ts/pull/2143
[2195]: https://github.com/roblox-ts/roblox-ts/pull/2195
[2196]: https://github.com/roblox-ts/roblox-ts/pull/2196
[2197]: https://github.com/roblox-ts/roblox-ts/pull/2197
[2201]: https://github.com/roblox-ts/roblox-ts/pull/2201
[2225]: https://github.com/roblox-ts/roblox-ts/pull/2225
[2242]: https://github.com/roblox-ts/roblox-ts/pull/2242
[2255]: https://github.com/roblox-ts/roblox-ts/pull/2255
[2265]: https://github.com/roblox-ts/roblox-ts/pull/2265
[2271]: https://github.com/roblox-ts/roblox-ts/pull/2271
[2302]: https://github.com/roblox-ts/roblox-ts/pull/2302
[2385]: https://github.com/roblox-ts/roblox-ts/pull/2385
[2401]: https://github.com/roblox-ts/roblox-ts/pull/2401
[2404]: https://github.com/roblox-ts/roblox-ts/pull/2404
[2445]: https://github.com/roblox-ts/roblox-ts/pull/2445
[2460]: https://github.com/roblox-ts/roblox-ts/pull/2460
[2465]: https://github.com/roblox-ts/roblox-ts/pull/2465
[2466]: https://github.com/roblox-ts/roblox-ts/pull/2466
[2475]: https://github.com/roblox-ts/roblox-ts/pull/2475
[2480]: https://github.com/roblox-ts/roblox-ts/pull/2480
[2489]: https://github.com/roblox-ts/roblox-ts/pull/2489
[2503]: https://github.com/roblox-ts/roblox-ts/pull/2503
[2506]: https://github.com/roblox-ts/roblox-ts/pull/2506
[2527]: https://github.com/roblox-ts/roblox-ts/pull/2527
[2528]: https://github.com/roblox-ts/roblox-ts/pull/2528
[2533]: https://github.com/roblox-ts/roblox-ts/pull/2533
[2546]: https://github.com/roblox-ts/roblox-ts/pull/2546
[2550]: https://github.com/roblox-ts/roblox-ts/pull/2550
[2567]: https://github.com/roblox-ts/roblox-ts/pull/2567
[2587]: https://github.com/roblox-ts/roblox-ts/pull/2587
[2588]: https://github.com/roblox-ts/roblox-ts/pull/2588
[2591]: https://github.com/roblox-ts/roblox-ts/pull/2591
[2597]: https://github.com/roblox-ts/roblox-ts/pull/2597
[2605]: https://github.com/roblox-ts/roblox-ts/pull/2605
[2606]: https://github.com/roblox-ts/roblox-ts/pull/2606
[2614]: https://github.com/roblox-ts/roblox-ts/pull/2614
[2617]: https://github.com/roblox-ts/roblox-ts/pull/2617
[2623]: https://github.com/roblox-ts/roblox-ts/pull/2623
[2648]: https://github.com/roblox-ts/roblox-ts/pull/2648
[2649]: https://github.com/roblox-ts/roblox-ts/pull/2649
[2672]: https://github.com/roblox-ts/roblox-ts/pull/2672
[2701]: https://github.com/roblox-ts/roblox-ts/pull/2701
[2704]: https://github.com/roblox-ts/roblox-ts/pull/2704
[2716]: https://github.com/roblox-ts/roblox-ts/pull/2716
[2724]: https://github.com/roblox-ts/roblox-ts/pull/2724
[2726]: https://github.com/roblox-ts/roblox-ts/pull/2726
[2728]: https://github.com/roblox-ts/roblox-ts/pull/2728
[2736]: https://github.com/roblox-ts/roblox-ts/pull/2736
[2737]: https://github.com/roblox-ts/roblox-ts/pull/2737
[2759]: https://github.com/roblox-ts/roblox-ts/pull/2759
[2778]: https://github.com/roblox-ts/roblox-ts/pull/2778
[2796]: https://github.com/roblox-ts/roblox-ts/pull/2796
[2800]: https://github.com/roblox-ts/roblox-ts/pull/2800
[2802]: https://github.com/roblox-ts/roblox-ts/pull/2802
[roblox-ts/luau-ast#483]: https://github.com/roblox-ts/luau-ast/pull/483
