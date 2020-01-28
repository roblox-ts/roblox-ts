# roblox-ts LuaAST

## Structure

**index.ts** - re-exports all exported values in each file

**enums.d.ts** - enums for lua.SyntaxKind, lua.BinaryOperator, lua.UnaryOperator

**nodes.d.ts** - contains interfaces that describe each node

**mapping.d.ts** - contains interfaces to describe the mapping of each node to IndexableExpression, Expression, Statement, and Field

**create.ts** - helper functions for creating nodes

**traversal.ts** - helper functions for traversing nodes

**typeGuards.ts** - helper functions for determining what a particular node is

**List.ts** - types + helper functions for lua.List<T> and lua.ListNode<T>

## Adding a new node

In order to add a new type of node, you must add a new:
1. enum to lua.SyntaxKind in enums.d.ts
2. interface to nodes.d.ts that describes the node
3. field in mapping.d.ts for what kind of node it is
4. typeGuard using makeGuard in typeGuards.ts AND add to specific generic guard Set
