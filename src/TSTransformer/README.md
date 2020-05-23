# roblox-ts TSTransformer

The goal of this project is to take a `ts.SourceFile` and turn it into a `lua.List<lua.Statement>`

In other words, TS AST -> Lua AST

### Features

-   [x] JS Truthiness
-   [x] Optional Chaining
-   [x] Method Call Detection
-   [x] Variable/Function Hoisting
-   [x] Destructuring
-   [x] Module Resolution (+ Rojo project)
-   [x] LuaTuple<T> Support
-   [x] npm package importing
-   [x] return nil for ModuleScripts without exports
-   [x] opcall
-   [x] Roact JSX
-   [x] Roact classes

### Expressions

-   [x] Identifier
-   [x] TrueKeyword + FalseKeyword
-   [x] NumericLiteral
-   [x] StringLiteral
-   [x] ArrayLiteralExpression
-   [x] AsExpression
-   [x] PostfixUnaryExpression
-   [x] PrefixUnaryExpression
-   [x] BinaryExpression
-   [x] CallExpression
-   [x] ConditionalExpression
-   [x] PropertyAccessExpression
-   [x] ElementAccessExpression
-   [x] NewExpression
-   [x] NonNullExpression
-   [x] ObjectLiteralExpression
-   [x] ParenthesizedExpression
-   [x] ArrowFunction + FunctionExpression (partially complete)
-   [x] TemplateExpression
-   [x] TaggedTemplateExpression
-   [x] AwaitExpression
-   [x] SpreadElement
-   [x] ClassExpression
-   [x] OmittedExpression
-   [x] ThisExpression
-   [x] SuperExpression
-   [x] JsxSelfClosingElement
-   [x] JsxExpression

### Statements

-   [x] Block
-   [x] ExpressionStatement
-   [x] FunctionDeclaration (partially complete)
-   [x] IfStatement
-   [x] ReturnStatement
-   [x] VariableStatement
-   [x] DoStatement
-   [x] WhileStatement
-   [x] BreakStatement
-   [x] ContinueStatement (Luau-y for now)
-   [x] ForStatement
-   [x] ForOfStatement
-   [x] ThrowStatement
-   [x] ImportDeclaration
-   [x] ImportEqualsDeclaration
-   [x] ExportDeclaration
-   [x] ExportAssignment
-   [x] ClassDeclaration
-   [x] ModuleDeclaration
-   [x] EnumDeclaration
-   [x] SwitchStatement

### Constructor Macros

-   [x] new Array()
-   [x] new Set()
-   [x] new Map()
-   [x] new WeakSet()
-   [x] new WeakMap()

### Identifier Macros

-   [x] PKG_VERSION

### Call Macros

-   [x] typeOf
-   [x] typeIs
-   [x] classIs

### Data Type Math Macros

-   [x] CFrame.add()
-   [x] CFrame.sub()
-   [x] CFrame.mul()
-   [x] UDim.add()
-   [x] UDim.sub()
-   [x] UDim2.add()
-   [x] UDim2.sub()
-   [x] Vector2.add()
-   [x] Vector2.sub()
-   [x] Vector2.mul()
-   [x] Vector2.div()
-   [x] Vector2int16.add()
-   [x] Vector2int16.sub()
-   [x] Vector2int16.mul()
-   [x] Vector2int16.div()
-   [x] Vector3.add()
-   [x] Vector3.sub()
-   [x] Vector3.mul()
-   [x] Vector3.div()
-   [x] Vector3int16.add()
-   [x] Vector3int16.sub()
-   [x] Vector3int16.mul()
-   [x] Vector3int16.div()

### Object Macros

-   [ ] Object.keys()
-   [ ] Object.values()
-   [ ] Object.entries()
-   [ ] Object.assign()
-   [x] Object.copy()
-   [ ] Object.deepCopy()
-   [ ] Object.deepEquals()
-   [ ] Object.toString()

### Array Macros

-   [x] ArrayLike.size()
-   [ ] ArrayLike.get()
-   [x] ReadonlyArray.isEmpty()
-   [ ] ReadonlyArray.toString()
-   [ ] ReadonlyArray.concat()
-   [x] ReadonlyArray.join()
-   [ ] ReadonlyArray.slice()
-   [ ] ReadonlyArray.includes()
-   [x] ReadonlyArray.indexOf()
-   [ ] ReadonlyArray.lastIndexOf()
-   [x] ReadonlyArray.every()
-   [x] ReadonlyArray.some()
-   [x] ReadonlyArray.forEach()
-   [x] ReadonlyArray.map()
-   [ ] ReadonlyArray.mapFiltered()
-   [ ] ReadonlyArray.filterUndefined()
-   [ ] ReadonlyArray.filter()
-   [ ] ReadonlyArray.reduce()
-   [ ] ReadonlyArray.reduceRight()
-   [x] ReadonlyArray.reverse()
-   [ ] ReadonlyArray.entries()
-   [ ] ReadonlyArray.find()
-   [ ] ReadonlyArray.findIndex()
-   [ ] ReadonlyArray.copy()
-   [ ] ReadonlyArray.deepCopy()
-   [ ] ReadonlyArray.deepEquals()
-   [ ] ReadonlyArray.sort()
-   [x] Array.push()
-   [x] Array.pop()
-   [ ] Array.shift()
-   [ ] Array.unshift()
-   [ ] Array.copyWithin()
-   [ ] Array.insert()
-   [ ] Array.remove()
-   [ ] Array.unorderedRemove()

### Set Macros

-   [x] ReadonlySet.isEmpty()
-   [ ] ReadonlySet.toString()
-   [x] ReadonlySet.forEach()
-   [x] ReadonlySet.size()
-   [ ] ReadonlySet.values()
-   [x] ReadonlySet.has()
-   [ ] ReadonlySet.union()
-   [ ] ReadonlySet.intersect()
-   [ ] ReadonlySet.difference()
-   [ ] ReadonlySet.isDisjointWith()
-   [ ] ReadonlySet.isSubsetOf()
-   [x] Set.add()
-   [x] Set.delete()
-   [x] Set.clear()

### Map Macros

-   [x] ReadonlyMap.isEmpty()
-   [ ] ReadonlyMap.toString()
-   [ ] ReadonlyMap.forEach()
-   [x] ReadonlyMap.size()
-   [ ] ReadonlyMap.values()
-   [x] ReadonlyMap.has()
-   [x] ReadonlyMap.get()
-   [ ] ReadonlyMap.entries()
-   [ ] ReadonlyMap.keys()
-   [x] Map.set()
-   [x] Map.delete()
-   [x] Map.clear()
-   [ ] Map.getOrSet()

### String Macros

-   [x] String.byte()
-   [ ] String.endsWith()
-   [x] String.find()
-   [x] String.format()
-   [ ] String.includes()
-   [ ] String.indexOf()
-   [ ] String.padEnd()
-   [ ] String.padStart()
-   [x] String.size()
-   [x] String.slice()
-   [x] String.split()
-   [ ] String.startsWith()
-   [x] String.sub()
-   [x] String.trim()
-   [x] String.trimEnd()
-   [x] String.trimStart()

### Promise Macros

-   [x] Promise.then()
