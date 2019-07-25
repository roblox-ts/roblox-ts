### **0.2.13**
- Fixed bug with call expressions + non null assertion. i.e. `map.get(x)![0]`

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