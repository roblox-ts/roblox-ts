### **0.3.0**
- Truthiness Rework: Truthiness is now evaluated like in TypeScript/JavaScript. `0`, `""`, and `NaN` are now falsy.
	- Added compiler option `--logTruthyChanges`, which displays all code affected by the truthiness change.
- Fixed `&&`/`||` expressions which now respect the control flow of expressions which require multiple statements in Lua
- Fixed behavior for when libraries require a different version of a package other than the one globally installed in a project
- Fixed #586 - `new ReadonlySet()` and `new ReadonlyMap()` now work
- Fixed #604 - `rbxtsc --init package` now fills out package.json better
- Fix issues relating to method vs callback logic, specifically, making `this` work better as a first parameter. This should improve object composability. See https://git.io/fjxRS
- Converted almost all of our bitwise operators to bit32
- Fixed our system of checking whether something is a type vs a value.
- Fixed importing system for when your project requires a package version other than the globally installed one.
- Added macro variable `PKG_VERSION` which gets replaced with the "version" string in your package.json file on compile
- Replaced our `getfenv(0).script` calls with passing in `script` as the first parameter in `TS.import` and `TS.getModule`. This means packages will have to be republished, but anyone can easily fix a broken package by inserting `script` as the first parameter themselves.
- Fixed `Array.reduce` and `Array.reduceRight` functions
    - They now pass in the right index into the reducer function (arrays start at 0, not 1)
	- They now pass the array into the reducer function
	- They now error when attempting to reduce an empty array without an initialValue passed in
	- `undefined` is now a valid initialValue

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
