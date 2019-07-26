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
- Added `rbxtsc --init` with the following options:
	- `rbxtsc --init game`
	- `rbxtsc --init bundle`
	- `rbxtsc --init package`\
	It will not run if you have a non-empty src folder