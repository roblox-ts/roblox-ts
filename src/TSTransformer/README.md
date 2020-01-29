# roblox-ts TSTransformer

The goal of this project is to take a ts.SourceFile and turn it into a lua.List<lua.Statement>

In other words, TS AST -> Lua AST

### Design Requirements

The system needs to be designed to support the following:
- Prerequisite Statements
- Hoisting
- Temporary Variables
- 0, "", NaN should be Falsy

Ideally, these should be done in a way that makes it hard for us to mess it up and mostly automatic from an individual `transformX()`'s perspective.
