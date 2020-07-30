# roblox-ts TSTransformer

The goal of this project is to take a `ts.SourceFile` and turn it into a `luau.List<luau.Statement>`

In other words, TS AST -> Luau AST

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
-   [x] VoidExpression
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

-   [x] Object.keys()
-   [x] Object.values()
-   [x] Object.entries()
-   [ ] Object.assign()
-   [x] Object.copy()
-   [ ] Object.deepCopy()
-   [ ] Object.deepEquals()
-   [ ] Object.toString()
-   [x] Object.isEmpty()

### Array Macros

-   [x] ArrayLike.size()
-   [ ] ArrayLike.get()
-   [x] ReadonlyArray.isEmpty()
-   [ ] ReadonlyArray.toString()
-   [x] ReadonlyArray.concat()
-   [x] ReadonlyArray.join()
-   [x] ReadonlyArray.slice()
-   [x] ReadonlyArray.includes()
-   [x] ReadonlyArray.indexOf()
-   [x] ReadonlyArray.lastIndexOf()
-   [x] ReadonlyArray.every()
-   [x] ReadonlyArray.some()
-   [x] ReadonlyArray.forEach()
-   [x] ReadonlyArray.map()
-   [x] ReadonlyArray.mapFiltered()
-   [x] ReadonlyArray.filterUndefined()
-   [x] ReadonlyArray.filter()
-   [x] ReadonlyArray.reduce()
-   [x] ReadonlyArray.reduceRight()
-   [x] ReadonlyArray.reverse()
-   [x] ReadonlyArray.entries()
-   [x] ReadonlyArray.find()
-   [x] ReadonlyArray.findIndex()
-   [x] ReadonlyArray.copy()
-   [ ] ReadonlyArray.deepCopy()
-   [ ] ReadonlyArray.deepEquals()
-   [x] ReadonlyArray.sort()
-   [x] Array.push()
-   [x] Array.pop()
-   [x] Array.shift()
-   [x] Array.unshift()
-   [ ] Array.copyWithin()
-   [x] Array.insert()
-   [x] Array.remove()
-   [x] Array.unorderedRemove()

### Set Macros

-   [x] ReadonlySet.isEmpty()
-   [ ] ReadonlySet.toString()
-   [x] ReadonlySet.forEach()
-   [x] ReadonlySet.size()
-   [x] ReadonlySet.values()
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
-   [x] ReadonlyMap.forEach()
-   [x] ReadonlyMap.size()
-   [x] ReadonlyMap.values()
-   [x] ReadonlyMap.has()
-   [x] ReadonlyMap.get()
-   [x] ReadonlyMap.entries()
-   [x] ReadonlyMap.keys()
-   [x] Map.set()
-   [x] Map.delete()
-   [x] Map.clear()
-   [ ] Map.getOrSet()

### String Macros

-   [x] String.byte()
-   [ ] String.endsWith()
-   [x] String.find()
-   [x] String.format()
-   [x] String.includes()
-   [x] String.indexOf()
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
