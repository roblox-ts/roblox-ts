# roblox-ts LuauAST

## Structure

**index.ts** - re-exports all exported values in each file

**types/enums.d.ts** - enums for luau.SyntaxKind, luau.BinaryOperator, luau.UnaryOperator

**types/nodes.d.ts** - contains interfaces that describe each node

**impl/mapping.d.ts** - contains interfaces to describe the mapping of each node to IndexableExpression, Expression, Statement, and Field

**impl/create.ts** - helper functions for creating nodes

**impl/traversal.ts** - helper functions for traversing nodes

**impl/typeGuards.ts** - helper functions for determining what a particular node is

**impl/List.ts** - types + helper functions for luau.List<T> and luau.ListNode<T>

## Adding a new node

In order to add a new type of node, you must add a new:

1. enum to luau.SyntaxKind in enums.d.ts
2. interface to nodes.d.ts that describes the node
3. field in mapping.d.ts for what kind of node it is
4. typeGuard using makeGuard in typeGuards.ts AND add to specific generic guard Set
