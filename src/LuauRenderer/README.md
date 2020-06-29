# roblox-ts LuauRenderer

This project takes a Luau AST (from LuauAST) and converts it into Luau source code in the form of a string.

## Structure

**index.ts** - contains the global render function, takes any node and routes it to the appropriate `renderX()` function to turn it into a string

**RenderState.ts** - stores the current state of the render process, instance is passed into every `renderX()` function

**nodes/** - folder containing modules that each export a `renderX(state: RenderState, node: luau.X): string` function

**util/** - various helper modules to aid in rendering
