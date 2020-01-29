# roblox-ts TSProject

Controls the orchestration of:
- loading options from tsconfig.json,
- passing TS AST from TS compiler API into TSTransformer,
- passing Lua AST from TSTransformer into LuaRender,
- writing to file

So in short,
.ts -> TS AST -> TSTransformer -> LuaAST -> LuaRenderer -> .lua
