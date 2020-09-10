# roblox-ts

The roblox-ts compiler is made up of 5 subprojects that each have their own goals + 1 subproject to contain shared utility code used by multiple subprojects.

-   [CLI](./CLI/README.md)
-   [LuauAST](./LuauAST/README.md)
-   [LuauRenderer](./LuauRenderer/README.md)
-   [Project](./Project/README.md)
-   [TSTransformer](./TSTransformer/README.md)

### **Todo**

-   [x] Initialization (`rbxtsc --init`)
    -   Modes: Game, Model, Plugin, Package (npm)
    -   Flags: eslint, prettier (implies eslint?), git? (for `git init` + `.gitignore`)
        -   Should these all default to `true`? i.e. `rbxtsc --init game --prettier=false`
        -   Should we use something like [inquirer](https://www.npmjs.com/package/inquirer) instead?
-   [ ] Watch Mode (`rbxtsc -w`)
    -   Could use built-in TypeScript watch infra, might not work on non-TS files? Chokidar (on non-ts) + TS infra?
    -   Chokidar -> "full" incremental build? Maybe this is good enough?
-   [ ] Fix String methods/calls offsetting for arguments + result, add back `string.*` library
-   [ ] Iteration System
    -   Array Destructuring - Single iteration of next item in iterable (currently things like arrayAccessor, etc.)
    -   Array Destructuring Spread - Loop over remaining items in iterable, add to object
    -   ForOf Statement / Spread Expression - Loop over items in iterable
    -   Iterables
        -   [ ] `Array<T>`
        -   [ ] `Map<K, V>`
        -   [ ] `Set<T>`
        -   [ ] `String`
        -   [ ] `IterableFunction<LuaTuple<T>>`
        -   [ ] `Generator`
-   [x] Reserved Lua identifiers (`and`, `or`, `then`, `nil`, etc.)
-   [x] Reserved Class methods (`__index`, `__newindex`, etc.)
-   [x] Class static/instance method collision
-   [ ] Macros which access `node.arguments` do not properly account for spreads
-   [x] Rewrite RojoResolver to support nested Rojo projects, will be used for packages in the future
-   [ ] Add RojoResolver support for symlinks in node_modules
-   [x] Generator Functions
-   [x] .d.ts emit improvements
    -   Fix `/// <reference types="types" />` -> `/// <reference types="@rbxts/types" />`
    -   Redefine imports/exports to use baseUrl correctly
