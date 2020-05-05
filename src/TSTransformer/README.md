# roblox-ts TSTransformer

The goal of this project is to take a ts.SourceFile and turn it into a lua.List<lua.Statement>

In other words, TS AST -> Lua AST

### Features
- [X] JS Truthiness
- [X] Optional Chaining
- [X] Method Call Detection
- [X] Variable/Function Hoisting
- [x] Destructuring
- [ ] Module Resolution (+ Rojo project)
- [ ] LuaTuple<T> Support

### Expressions
- [X] Identifier
- [X] TrueKeyword + FalseKeyword
- [X] NumericLiteral
- [X] StringLiteral
- [X] ArrayLiteralExpression
- [X] AsExpression
- [X] PostfixUnaryExpression
- [X] PrefixUnaryExpression
- [X] BinaryExpression
- [X] CallExpression
- [X] ConditionalExpression
- [X] PropertyAccessExpression
- [X] ElementAccessExpression
- [X] NewExpression
- [X] NonNullExpression
- [X] ObjectLiteralExpression
- [X] ParenthesizedExpression
- [X] ArrowFunction + FunctionExpression (partially complete)
- [ ] TemplateExpression
- [ ] TaggedTemplateExpression
- [ ] AwaitExpression
- [ ] SpreadElement
- [ ] ClassExpression
- [ ] OmittedExpression
- [ ] ThisExpression
- [ ] SuperExpression
- [ ] JsxSelfClosingElement
- [ ] JsxExpression

### Statements
- [X] Block
- [X] ExpressionStatement
- [X] FunctionDeclaration (partially complete)
- [X] IfStatement
- [X] ReturnStatement
- [X] VariableStatement
- [X] DoStatement
- [X] WhileStatement
- [X] BreakStatement
- [X] ContinueStatement (Luau-y for now)
- [ ] ForStatement
- [ ] ForOfStatement
- [X] ThrowStatement
- [ ] ImportDeclaration
- [ ] ImportEqualsDeclaration
- [ ] ExportDeclaration
- [ ] ExportAssignment
- [ ] ClassDeclaration
- [ ] NamespaceDeclaration
- [X] EnumDeclaration
- [ ] SwitchStatement
- [ ] TryStatement?

### Constructor Macros
- [X] new Array()
- [X] new Set()
- [X] new Map()
- [X] new WeakSet()
- [X] new WeakMap()

### Identifier Macros
- [X] PKG_VERSION (Doesn't actually look up package.json version yet..)

### Call Macros
- [X] typeOf
- [X] typeIs
- [X] classIs

### Data Type Math Macros
- [X] CFrame.add()
- [X] CFrame.sub()
- [X] CFrame.mul()
- [X] UDim.add()
- [X] UDim.sub()
- [X] UDim2.add()
- [X] UDim2.sub()
- [X] Vector2.add()
- [X] Vector2.sub()
- [X] Vector2.mul()
- [X] Vector2.div()
- [X] Vector2int16.add()
- [X] Vector2int16.sub()
- [X] Vector2int16.mul()
- [X] Vector2int16.div()
- [X] Vector3.add()
- [X] Vector3.sub()
- [X] Vector3.mul()
- [X] Vector3.div()
- [X] Vector3int16.add()
- [X] Vector3int16.sub()
- [X] Vector3int16.mul()
- [X] Vector3int16.div()

### Object Macros
- [ ] Object.keys()
- [ ] Object.values()
- [ ] Object.entries()
- [ ] Object.assign()
- [ ] Object.copy()
- [ ] Object.deepCopy()
- [ ] Object.deepEquals()
- [ ] Object.toString()

### Array Macros
- [X] ArrayLike.size()
- [ ] ArrayLike.get()
- [X] ReadonlyArray.isEmpty()
- [ ] ReadonlyArray.toString()
- [ ] ReadonlyArray.concat()
- [X] ReadonlyArray.join()
- [ ] ReadonlyArray.slice()
- [ ] ReadonlyArray.includes()
- [ ] ReadonlyArray.indexOf()
- [ ] ReadonlyArray.lastIndexOf()
- [X] ReadonlyArray.every()
- [X] ReadonlyArray.some()
- [X] ReadonlyArray.forEach()
- [X] ReadonlyArray.map()
- [ ] ReadonlyArray.mapFiltered()
- [ ] ReadonlyArray.filterUndefined()
- [ ] ReadonlyArray.filter()
- [ ] ReadonlyArray.reduce()
- [ ] ReadonlyArray.reduceRight()
- [X] ReadonlyArray.reverse()
- [ ] ReadonlyArray.entries()
- [ ] ReadonlyArray.find()
- [ ] ReadonlyArray.findIndex()
- [ ] ReadonlyArray.copy()
- [ ] ReadonlyArray.deepCopy()
- [ ] ReadonlyArray.deepEquals()
- [ ] ReadonlyArray.sort()
- [X] Array.push()
- [X] Array.pop()
- [ ] Array.shift()
- [ ] Array.unshift()
- [ ] Array.copyWithin()
- [ ] Array.insert()
- [ ] Array.remove()
- [ ] Array.unorderedRemove()

### Set Macros
- [ ] ReadonlySet.isEmpty()
- [ ] ReadonlySet.toString()
- [ ] ReadonlySet.forEach()
- [ ] ReadonlySet.size()
- [ ] ReadonlySet.values()
- [ ] ReadonlySet.has()
- [ ] ReadonlySet.union()
- [ ] ReadonlySet.intersect()
- [ ] ReadonlySet.difference()
- [ ] ReadonlySet.isDisjointWith()
- [ ] ReadonlySet.isSubsetOf()
- [ ] Set.add()
- [ ] Set.delete()
- [ ] Set.clear()

### Map Macros
- [ ] ReadonlyMap.isEmpty()
- [ ] ReadonlyMap.toString()
- [ ] ReadonlyMap.forEach()
- [ ] ReadonlyMap.size()
- [ ] ReadonlyMap.values()
- [ ] ReadonlyMap.has()
- [ ] ReadonlyMap.get()
- [ ] ReadonlyMap.entries()
- [ ] ReadonlyMap.keys()
- [ ] Map.set()
- [ ] Map.delete()
- [ ] Map.clear()
- [ ] Map.getOrSet()

### String Macros
- [X] String.byte()
- [ ] String.endsWith()
- [X] String.find()
- [X] String.format()
- [ ] String.includes()
- [ ] String.indexOf()
- [ ] String.padEnd()
- [ ] String.padStart()
- [X] String.size()
- [X] String.slice()
- [X] String.split()
- [ ] String.startsWith()
- [X] String.sub()
- [X] String.trim()
- [X] String.trimEnd()
- [X] String.trimStart()

### Promise Macros
- [ ] Promise.then()
