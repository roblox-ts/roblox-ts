### **0.3.1**
- Try/Catch is now banned. See issue #873 for more details.
- Reworked file copying logic! roblox-ts now copies any file/folder it doesn't compile from src -> out.
	- This is useful for things like Rojo's *.meta.json files
- JSON modules can now be imported like regular modules. This requires `"resolveJsonModule": true,` in tsconfig.json
	- JSON files that get compiled to .lua will _not_ be copied over as .json
- Fixed bug where you could access `arguments` and `globalThis` (TS global variables we don't support)
- --help command now fills full width of terminal
- Added string.startsWith/endsWith
- Added utf8 library support
- Made string destructuring grab the proper codepoint
- Add Object.fromEntries
- **BREAKING CHANGE** - node_modules no longer copies under `include`
	- You must now add `node_modules/@rbxts` manually into your rojo default.project.json.
	- It should sit under your `include` folder.
	- So if your `include` part looked like this before:
	```JSON
	"rbxts_include": {
		"$path": "include",
	},
	```
	- It should now look like this:
	```JSON
	"rbxts_include": {
		"$path": "include",
		"node_modules": {
			"$path": "node_modules/@rbxts"
		}
	},
	```

### **0.3.0**
- Truthiness Rework: Truthiness is now evaluated like in TypeScript/JavaScript. `0`, `""`, and `NaN` are now falsy.
	- Added compiler option `--logTruthyChanges`, which displays all code affected by the truthiness change.
- Fixed `&&`/`||` expressions which now respect the control flow of expressions which require multiple statements in Lua.
- Fixed behavior for when libraries require a different version of a package other than the one globally installed in a project.
- Fixed #586 - `new ReadonlySet()` and `new ReadonlyMap()` now work.
- Fixed #604 - `rbxtsc --init package` now fills out package.json better.
- Fix issues relating to method vs callback logic, specifically, making `this` work better as a first parameter. This should improve object composability. See https://git.io/fjxRS
- Converted almost all of our bitwise operators to bit32.
- Fixed our system of checking whether something is a type vs a value.
- Fixed importing system for when your project requires a package version other than the globally installed one.
- Added macro variable `PKG_VERSION` which gets replaced with the "version" string in your package.json file on compile.
- Added support for TS 3.6 Generators, and also added support for directly and indirectly indexing Symbol.iterator from iterable functions and methods. See https://git.io/Jem1l
- Replaced our `getfenv(0).script` calls with passing in `script` as the first parameter in `TS.import` and `TS.getModule`. This means packages will have to be republished, but anyone can easily fix a broken package by inserting `script` as the first parameter themselves.
- Fixed `Array.reduce` and `Array.reduceRight` functions
    - They now pass in the right index into the reducer function (arrays start at 0, not 1)
	- They now pass the array into the reducer function
	- They now error when attempting to reduce an empty array without an initialValue passed in
	- `undefined` is now a valid initialValue
- Changed our limited emulation of JS behavior where many array methods wouldn't call callbacks on empty values in arrays (we considered any `nil` value `empty`). Now, every callback in every array method gets called on every item within arrays, even `nil` values if applicable. This should be more straightforward and easier to understand (and easier for our type system). This change shouldn't affect most people, since we discourage using arrays with holes anyway.
	- If you need to strip an array of `nil` values, use `Array.filter((v): v is NonNullable<typeof v> => v !== undefined);`
    - We should release a library for safely making arrays with holes for that niche use case, where `length` is tracked as a real value.
- Declaring the same enum multiple times (merging) is no longer allowed. As a result `Object.keys` and `Object.values` now work with enums!
- Added support for importing .json files! They will compile to .lua files. (Thanks to Vorlias)

### **0.2.14**
- Fixed analytics bug

### **0.2.13**
- Fixed #285 - Watch mode now recompiles files which import the file you changed
- Fixed #296 - ensure tsconfig.json is readable
- Fixed #297 - better project config errors
- Fixed #573 - fixed call expressions + non null assertion. i.e. `map.get(x)![0]`
- Added analytics to help track most common errors.
	- You can opt out globally with `rbxtsc --noAnalytics` (only needed once)
	- Opt back in with `rbxtsc --noAnalytics=false`

### **0.2.12**
- Replaced .npmignore with "files" field to resolve npm issues

### **0.2.11**
- Removed empty field initializers from compiled constructor. i.e. `self.field = nil;`
- Renamed "bundle" to "model"
- Added `rbxtsc --init plugin`
- Fixed `rbxtsc --init` bug

### **0.2.10**
- Improved Watch mode stability
- Improved error handling
- Ability to recover from ts-morph failed to refresh file
- Improved destructuring stability
- Added `rbxtsc --init`
	- with the following options:
		- `rbxtsc --init game`
		- `rbxtsc --init bundle`
		- `rbxtsc --init package`
	- It will not run if you have a non-empty src folder
