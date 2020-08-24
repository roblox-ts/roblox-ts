# roblox-ts Project

Controls the orchestration of:

-   loading options from tsconfig.json,
-   passing TS AST from TS compiler API into TSTransformer,
-   passing Luau AST from TSTransformer into LuauRender,
-   writing to file

So in short,
.ts -> TS AST -> TSTransformer -> LuauAST -> LuauRenderer -> .lua

### Jobs

-   Create ts.Program, ts.TypeChecker
-   Validate compiler options
-   Orchaestrate compile process (above)
-   Single file compiling (watch mode) - might need to also compile referencing files recursively
-   Compile by source (playground)
-   Path mapping - index.\*.\* -> init.\*.\* - .ts -> .lua - .tsx -> .lua - .json -> .lua - all other files -> relative to out
-   Reverse path mapping for clean up process. If there's no file that could have generated a given file/folder (either by compiling or copying), we should clean that up
-   Smart copying? We can't just copy a whole folder over, it might have files inside of it that get compiled (and should not be copied).
