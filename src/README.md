# roblox-ts

The roblox-ts compiler is made up of 5 subprojects that each have their own goals + 1 subproject to contain shared utility code used by multiple subprojects.

-   [CLI](./CLI/README.md)
-   [LuauAST](./LuauAST/README.md)
-   [LuauRenderer](./LuauRenderer/README.md)
-   [Project](./Project/README.md)
-   [TSTransformer](./TSTransformer/README.md)

### **Todo**

-   [ ] Finish spread expression types
-   [ ] Finish array spread expression types
-   [ ] Add optimization for expressions in the form of `[...exp]` (reuse spread expression functions without `unpack()`)
-   [ ] Add for-of loop optimizations for `Object.values`, `Object.keys`, `Object.entries`, etc.
-   [ ] Upgrade to TypeScript 4.0 and add support for `&&=`, `||=`, `??=`
-   [ ] Remove string input incrementing and output decrementing
-   [ ] Add error for using spread operator on macros
-   [ ] Add error for using macros with union types
-   [ ] Improve JSX expression type detection
