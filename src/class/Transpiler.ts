import * as ts from "ts-simple-ast";
import { safeLuaIndex } from "../utility";
import { Compiler } from "./Compiler";
import { TranspilerError } from "./errors/TranspilerError";

type HasParameters =
	| ts.FunctionExpression
	| ts.ArrowFunction
	| ts.FunctionDeclaration
	| ts.ConstructorDeclaration
	| ts.MethodDeclaration
	| ts.GetAccessorDeclaration
	| ts.SetAccessorDeclaration;

// used for the typeof operator
const RBX_CLASSES = [
	"Axes",
	"BrickColor",
	"CFrame",
	"Color3",
	"ColorSequence",
	"ColorSequenceKeypoint",
	"DockWidgetPluginGuiInfo",
	"Faces",
	"NumberRange",
	"NumberSequence",
	"NumberSequenceKeypoint",
	"PathWaypoint",
	"PhysicalProperties",
	"Random",
	"Ray",
	"Rect",
	"Region3",
	"Region3int16",
	"TweenInfo",
	"UDim",
	"UDim2",
	"Vector2",
	"Vector2int16",
	"Vector3",
	"Vector3int16",

	"RBXScriptConnection",
	"RBXScriptSignal",
];

const STRING_MACRO_METHODS = [
	"byte",
	"find",
	"format",
	"gmatch",
	"gsub",
	"len",
	"lower",
	"match",
	"rep",
	"reverse",
	"sub",
	"upper",
];

const RBX_MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];

const RUNTIME_CLASSES = ["Promise", "Symbol"];

const LUA_RESERVED_KEYWORDS = [
	"and",
	"break",
	"do",
	"else",
	"elseif",
	"end",
	"false",
	"for",
	"function",
	"if",
	"in",
	"local",
	"nil",
	"not",
	"or",
	"repeat",
	"return",
	"then",
	"true",
	"until",
	"while",
];

const LUA_RESERVED_METAMETHODS = [
	"__index",
	"__newindex",
	"__add",
	"__sub",
	"__mul",
	"__div",
	"__mod",
	"__pow",
	"__unm",
	"__eq",
	"__lt",
	"__le",
	"__call",
	"__concat",
	"__tostring",
	"__len",
	"__metatable",
	"__mode",
];

const LUA_UNDEFINABLE_METAMETHODS = ["__index", "__newindex", "__mode"];

function isRbxClassType(type: ts.Type) {
	const symbol = type.getSymbol();
	return symbol !== undefined && RBX_CLASSES.indexOf(symbol.getName()) !== -1;
}

function getLuaAddExpression(node: ts.BinaryExpression, lhsStr: string, rhsStr: string, wrap = false) {
	if (wrap) {
		rhsStr = `(${rhsStr})`;
	}
	const leftType = node.getLeft().getType();
	const rightType = node.getRight().getType();
	if (leftType.isString() || rightType.isString() || leftType.isStringLiteral() || rightType.isStringLiteral()) {
		return `${lhsStr} .. ${rhsStr}`;
	} else if (
		(leftType.isNumber() || leftType.isNumberLiteral()) &&
		(rightType.isNumber() || rightType.isNumberLiteral())
	) {
		return `${lhsStr} + ${rhsStr}`;
	} else {
		return `TS.add(${lhsStr}, ${rhsStr})`;
	}
}

function inheritsFrom(type: ts.Type, className: string): boolean {
	const symbol = type.getSymbol();
	return symbol !== undefined
		? symbol.getName() === className ||
				symbol.getDeclarations().some(declaration =>
					declaration
						.getType()
						.getBaseTypes()
						.some(baseType => inheritsFrom(baseType, className)),
				)
		: false;
}

function getConstructor(node: ts.ClassDeclaration) {
	for (const constructor of node.getConstructors()) {
		if (constructor.getBody() !== undefined) {
			return constructor;
		}
	}
}

function isBindingPattern(node: ts.Node) {
	return (
		node.getKind() === ts.SyntaxKind.ArrayBindingPattern || node.getKind() === ts.SyntaxKind.ObjectBindingPattern
	);
}

function getClassMethod(classDec: ts.ClassDeclaration, methodName: string): ts.MethodDeclaration | undefined {
	const method = classDec.getMethod(methodName);
	if (method) {
		return method;
	}
	const baseClass = classDec.getBaseClass();
	if (baseClass) {
		const baseMethod = getClassMethod(baseClass, methodName);
		if (baseMethod) {
			return baseMethod;
		}
	}
	return undefined;
}

export class Transpiler {
	private hoistStack = new Array<Array<string>>();
	private exportStack = new Array<Array<string>>();
	private idStack = new Array<number>();
	private continueId = -1;
	private isModule = false;
	private indent = "";

	constructor(private compiler: Compiler) {}

	private getNewId() {
		const sum = this.idStack.reduce((accum, value) => accum + value);
		this.idStack[this.idStack.length - 1]++;
		return `_${sum}`;
	}

	private checkReserved(name: string, node: ts.Node) {
		if (LUA_RESERVED_KEYWORDS.indexOf(name) !== -1) {
			throw new TranspilerError(`Cannot use reserved Lua keyword as identifier '${name}'`, node);
		}
	}

	private checkMethodReserved(name: string, node: ts.Node) {
		if (LUA_RESERVED_METAMETHODS.indexOf(name) !== -1) {
			throw new TranspilerError(`Cannot use reserved Lua metamethod as identifier '${name}'`, node);
		}
	}

	private pushIdStack() {
		this.idStack.push(0);
	}

	private popIdStack() {
		this.idStack.pop();
	}

	private pushIndent() {
		this.indent += "\t";
	}

	private popIndent() {
		this.indent = this.indent.substr(1);
	}

	private pushExport(name: string, node: ts.Node & ts.ExportableNode) {
		if (!node.isExported()) {
			return;
		}

		const ancestor =
			node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration) ||
			node.getFirstAncestorByKind(ts.SyntaxKind.SourceFile);

		if (!ancestor) {
			throw new TranspilerError("Could not find export ancestor!", node);
		}

		let ancestorName: string;
		if (ts.TypeGuards.isNamespaceDeclaration(ancestor)) {
			ancestorName = ancestor.getName();
		} else {
			this.isModule = true;
			ancestorName = "_exports";
		}
		const alias = node.isDefaultExport() ? "_default" : name;
		this.exportStack[this.exportStack.length - 1].push(`${ancestorName}.${alias} = ${name};\n`);
	}

	private getBindingData(
		names: Array<string>,
		values: Array<string>,
		preStatements: Array<string>,
		postStatements: Array<string>,
		bindingPatern: ts.Node,
		parentId: string,
	) {
		const strKeys = bindingPatern.getKind() === ts.SyntaxKind.ObjectBindingPattern;
		const listItems = bindingPatern
			.getFirstChildByKindOrThrow(ts.SyntaxKind.SyntaxList)
			.getChildren()
			.filter(
				child =>
					child.getKind() === ts.SyntaxKind.BindingElement ||
					child.getKind() === ts.SyntaxKind.OmittedExpression,
			);
		let childIndex = 1;
		for (const bindingElement of listItems) {
			if (bindingElement.getKind() === ts.SyntaxKind.BindingElement) {
				const [child, op, pattern] = bindingElement.getChildren();
				const childText = child.getText();
				const key = strKeys ? `"${childText}"` : childIndex;

				if (child.getKind() === ts.SyntaxKind.DotDotDotToken) {
					throw new TranspilerError("Operator ... is not supported for destructuring!", child);
				}

				if (pattern && isBindingPattern(pattern)) {
					const childId = this.getNewId();
					preStatements.push(`local ${childId} = ${parentId}[${key}];`);
					this.getBindingData(names, values, preStatements, postStatements, pattern, childId);
				} else if (child.getKind() === ts.SyntaxKind.ArrayBindingPattern) {
					const childId = this.getNewId();
					preStatements.push(`local ${childId} = ${parentId}[${key}];`);
					this.getBindingData(names, values, preStatements, postStatements, child, childId);
				} else if (child.getKind() === ts.SyntaxKind.Identifier) {
					let id = child.getText();
					if (pattern && pattern.getKind() === ts.SyntaxKind.Identifier) {
						id = pattern.getText();
					}
					this.checkReserved(id, bindingPatern);
					names.push(id);
					if (op && op.getKind() === ts.SyntaxKind.EqualsToken) {
						const value = this.transpileExpression(pattern as ts.Expression);
						postStatements.push(`if ${id} == nil then ${id} = ${value} end;`);
					}
					values.push(`${parentId}[${key}]`);
				}
			}
			childIndex++;
		}
	}

	private getParameterData(
		paramNames: Array<string>,
		initializers: Array<string>,
		node: HasParameters,
		defaults?: Array<string>,
	) {
		for (const param of node.getParameters()) {
			const child =
				param.getFirstChildByKind(ts.SyntaxKind.Identifier) ||
				param.getFirstChildByKind(ts.SyntaxKind.ArrayBindingPattern) ||
				param.getFirstChildByKind(ts.SyntaxKind.ObjectBindingPattern);

			if (child === undefined) {
				throw new TranspilerError("Child missing from parameter!", param);
			}

			let name: string;
			if (ts.TypeGuards.isIdentifier(child)) {
				name = child.getText();
			} else if (isBindingPattern(child)) {
				name = this.getNewId();
			} else {
				const kindName = child.getKindName();
				throw new TranspilerError(`Unexpected parameter type! (${kindName})`, param);
			}

			this.checkReserved(name, node);

			if (param.isRestParameter()) {
				paramNames.push("...");
				initializers.push(`local ${name} = { ... };`);
			} else {
				paramNames.push(name);
			}

			const initial = param.getInitializer();
			if (initial) {
				const defaultValue = `if ${name} == nil then ${name} = ${this.transpileExpression(initial, true)} end;`;
				if (defaults) {
					defaults.push(defaultValue);
				} else {
					initializers.push(defaultValue);
				}
			}

			if (param.hasScopeKeyword()) {
				initializers.push(`self.${name} = ${name};`);
			}

			if (isBindingPattern(child)) {
				const names = new Array<string>();
				const values = new Array<string>();
				const preStatements = new Array<string>();
				const postStatements = new Array<string>();
				this.getBindingData(names, values, preStatements, postStatements, child, name);
				preStatements.forEach(statement => initializers.push(statement));
				const namesStr = names.join(", ");
				const valuesStr = values.join(", ");
				initializers.push(`local ${namesStr} = ${valuesStr};`);
				postStatements.forEach(statement => initializers.push(statement));
			}
		}
	}

	private hasContinue(node: ts.Node) {
		for (const child of node.getChildren()) {
			if (ts.TypeGuards.isContinueStatement(child)) {
				return true;
			}
			if (
				!(
					ts.TypeGuards.isForInStatement(child) ||
					ts.TypeGuards.isForOfStatement(child) ||
					ts.TypeGuards.isForStatement(child) ||
					ts.TypeGuards.isWhileStatement(child) ||
					ts.TypeGuards.isDoStatement(child)
				)
			) {
				if (this.hasContinue(child)) {
					return true;
				}
			}
		}
		return false;
	}

	private containsSuperExpression(child?: ts.Statement<ts.ts.Statement>) {
		if (child && ts.TypeGuards.isExpressionStatement(child)) {
			const exp = child.getExpression();
			if (ts.TypeGuards.isCallExpression(exp)) {
				const superExp = exp.getExpression();
				if (ts.TypeGuards.isSuperExpression(superExp)) {
					return true;
				}
			}
		}
		return false;
	}

	private transpileStatementedNode(node: ts.Node & ts.StatementedNode) {
		this.pushIdStack();
		this.exportStack.push(new Array<string>());
		let result = "";
		this.hoistStack.push(new Array<string>());
		for (const child of node.getStatements()) {
			result += this.transpileStatement(child);
			if (child.getKind() === ts.SyntaxKind.ReturnStatement) {
				break;
			}
		}

		const hoists = this.hoistStack.pop();
		if (hoists && hoists.length > 0) {
			const hoistsStr = hoists.join(", ");
			result = this.indent + `local ${hoistsStr};\n` + result;
		}
		const scopeExports = this.exportStack.pop();
		if (scopeExports && scopeExports.length > 0) {
			scopeExports.forEach(scopeExport => (result += this.indent + scopeExport));
		}
		this.popIdStack();
		return result;
	}

	private transpileBlock(node: ts.Block) {
		let result = "";
		const parent = node.getParentIfKind(ts.SyntaxKind.SourceFile) || node.getParentIfKind(ts.SyntaxKind.Block);
		if (parent) {
			result += this.indent + "do\n";
			this.pushIndent();
		}
		result += this.transpileStatementedNode(node);
		if (parent) {
			this.popIndent();
			result += this.indent + "end;\n";
		}
		return result;
	}

	private transpileArguments(args: Array<ts.Expression>, context?: ts.Expression) {
		if (context) {
			args.unshift(context);
		}
		return args.map(arg => this.transpileExpression(arg)).join(", ");
	}

	private transpileIdentifier(node: ts.Identifier) {
		if (node.getType().isUndefined() || node.getType().isInterface()) {
			return "nil";
		}
		let name = node.getText();
		this.checkReserved(name, node);
		if (RUNTIME_CLASSES.indexOf(name) !== -1) {
			name = `TS.${name}`;
		}
		return name;
	}

	private transpileStatement(node: ts.Statement): string {
		if (ts.TypeGuards.isBlock(node)) {
			if (node.getStatements().length === 0) {
				return "";
			}
			return this.transpileBlock(node);
		} else if (ts.TypeGuards.isImportDeclaration(node)) {
			return this.transpileImportDeclaration(node);
		} else if (ts.TypeGuards.isImportEqualsDeclaration(node)) {
			return this.transpileImportEqualsDeclaration(node);
		} else if (ts.TypeGuards.isExportDeclaration(node)) {
			return this.transpileExportDeclaration(node);
		} else if (ts.TypeGuards.isFunctionDeclaration(node)) {
			return this.transpileFunctionDeclaration(node);
		} else if (ts.TypeGuards.isClassDeclaration(node)) {
			return this.transpileClassDeclaration(node);
		} else if (ts.TypeGuards.isNamespaceDeclaration(node)) {
			return this.transpileNamespaceDeclaration(node);
		} else if (ts.TypeGuards.isDoStatement(node)) {
			return this.transpileDoStatement(node);
		} else if (ts.TypeGuards.isIfStatement(node)) {
			return this.transpileIfStatement(node);
		} else if (ts.TypeGuards.isBreakStatement(node)) {
			return this.transpileBreakStatement(node);
		} else if (ts.TypeGuards.isExpressionStatement(node)) {
			return this.transpileExpressionStatement(node);
		} else if (ts.TypeGuards.isContinueStatement(node)) {
			return this.transpileContinueStatement(node);
		} else if (ts.TypeGuards.isForInStatement(node)) {
			return this.transpileForInStatement(node);
		} else if (ts.TypeGuards.isForOfStatement(node)) {
			return this.transpileForOfStatement(node);
		} else if (ts.TypeGuards.isForStatement(node)) {
			return this.transpileForStatement(node);
		} else if (ts.TypeGuards.isReturnStatement(node)) {
			return this.transpileReturnStatement(node);
		} else if (ts.TypeGuards.isThrowStatement(node)) {
			return this.transpileThrowStatement(node);
		} else if (ts.TypeGuards.isVariableStatement(node)) {
			return this.transpileVariableStatement(node);
		} else if (ts.TypeGuards.isWhileStatement(node)) {
			return this.transpileWhileStatement(node);
		} else if (ts.TypeGuards.isEnumDeclaration(node)) {
			return this.transpileEnumDeclaration(node);
		} else if (ts.TypeGuards.isExportAssignment(node)) {
			return this.transpileExportAssignment(node);
		} else if (ts.TypeGuards.isSwitchStatement(node)) {
			return this.transpileSwitchStatement(node);
		} else if (
			ts.TypeGuards.isEmptyStatement(node) ||
			ts.TypeGuards.isTypeAliasDeclaration(node) ||
			ts.TypeGuards.isInterfaceDeclaration(node)
		) {
			return "";
		} else if (ts.TypeGuards.isLabeledStatement(node)) {
			throw new TranspilerError("Labeled statements are not supported!", node);
		} else {
			const kindName = node.getKindName();
			throw new TranspilerError(`Bad statement! (${kindName})`, node);
		}
	}

	private transpileImportDeclaration(node: ts.ImportDeclaration) {
		let sourceFile: ts.SourceFile | undefined
		let luaPath: string;
		if (node.isModuleSpecifierRelative()) {
			sourceFile = node.getModuleSpecifierSourceFile()
			luaPath = this.compiler.getRelativeImportPath(
				node.getSourceFile(),
				node.getModuleSpecifierSourceFile(),
				node.getModuleSpecifier().getLiteralText(),
			);
		} else {
			const moduleFile = node.getModuleSpecifierSourceFile();
			if (moduleFile) {
				luaPath = this.compiler.getImportPathFromFile(moduleFile);
			} else {
				const specifierText = node.getModuleSpecifier().getLiteralText();
				throw new TranspilerError(
					`Could not find file for '${specifierText}'. ` + `Did you forget to "npm install"?`,
					node,
				);
			}
		}

		const lhs = new Array<string>();
		const rhs = new Array<string>();

		const defaultImport = node.getDefaultImport();
		if (defaultImport) {
			lhs.push(this.transpileExpression(defaultImport));
			rhs.push(`._default`);
		}

		const namespaceImport = node.getNamespaceImport();
		if (namespaceImport) {
			lhs.push(this.transpileExpression(namespaceImport));
			rhs.push("");
		}

		node.getNamedImports().forEach(namedImport => {
			const aliasNode = namedImport.getAliasNode();
			const name = namedImport.getName();
			const alias = aliasNode ? aliasNode.getText() : name;
			if (!(sourceFile && sourceFile.getInterface(name))) {
				lhs.push(alias);
				rhs.push(`.${name}`);
			}
		});

		let result = "";
		let rhsPrefix: string;
		if (lhs.length === 0) {
			return result;
		} else if (rhs.length === 1) {
			rhsPrefix = luaPath;
		} else {
			rhsPrefix = this.getNewId();
			result += `local ${rhsPrefix} = ${luaPath};\n`;
		}
		const lhsStr = lhs.join(", ");
		const rhsStr = rhs.map(v => rhsPrefix + v).join(", ");
		result += `local ${lhsStr} = ${rhsStr};\n`;
		return result;
	}

	private transpileImportEqualsDeclaration(node: ts.ImportEqualsDeclaration) {
		let luaPath: string;
		const moduleFile = node.getExternalModuleReferenceSourceFile();
		if (moduleFile) {
			if (node.isExternalModuleReferenceRelative()) {
				let specifier: string;
				const moduleReference = node.getModuleReference();
				if (ts.TypeGuards.isExternalModuleReference(moduleReference)) {
					if (this.transpileExpression(moduleFile.getExportAssignments()[0].getExpression()) === "nil") {
						return ""
					}
					const exp = moduleReference.getExpressionOrThrow() as ts.StringLiteral;
					specifier = exp.getLiteralText();
				} else {
					throw new TranspilerError("Bad specifier", node);
				}
				luaPath = this.compiler.getRelativeImportPath(node.getSourceFile(), moduleFile, specifier);
			} else {
				luaPath = this.compiler.getImportPathFromFile(moduleFile);
			}
		} else {
			const text = node.getModuleReference().getText();
			throw new TranspilerError(`Could not find file for '${text}'`, node);
		}

		const name = node.getName();
		return this.indent + `local ${name} = ${luaPath};\n`;
	}

	private transpileExportDeclaration(node: ts.ExportDeclaration) {
		let luaPath: string = "";
		const moduleSpecifier = node.getModuleSpecifier();
		if (moduleSpecifier) {
			if (node.isModuleSpecifierRelative()) {
				luaPath = this.compiler.getRelativeImportPath(
					node.getSourceFile(),
					node.getModuleSpecifierSourceFile(),
					moduleSpecifier.getLiteralText(),
				);
			} else {
				const moduleFile = node.getModuleSpecifierSourceFile();
				if (moduleFile) {
					luaPath = this.compiler.getImportPathFromFile(moduleFile);
				} else {
					const specifierText = moduleSpecifier.getLiteralText();
					throw new TranspilerError(
						`Could not find file for '${specifierText}'. Did you forget to "npm install"?`,
						node,
					);
				}
			}
		}

		const ancestor =
			node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration) ||
			node.getFirstAncestorByKind(ts.SyntaxKind.SourceFile);

		if (!ancestor) {
			throw new TranspilerError("Could not find export ancestor!", node);
		}

		let ancestorName: string;
		if (ts.TypeGuards.isNamespaceDeclaration(ancestor)) {
			ancestorName = ancestor.getName();
		} else {
			this.isModule = true;
			ancestorName = "_exports";
		}

		const lhs = new Array<string>();
		const rhs = new Array<string>();

		if (node.isNamespaceExport()) {
			if (!moduleSpecifier) {
				throw new TranspilerError("Namespace exports require a module specifier!", node);
			}
			return this.indent + `TS.exportNamespace(require(${luaPath}), ${ancestorName});\n`;
		} else {
			node.getNamedExports().forEach(namedExport => {
				const aliasNode = namedExport.getAliasNode();
				let name = namedExport.getNameNode().getText();
				if (name === "default") {
					name = "_" + name;
				}
				const alias = aliasNode ? aliasNode.getText() : name;
				lhs.push(alias);
				rhs.push(`.${name}`);
			});

			let result = "";
			let rhsPrefix: string;
			const lhsPrefix = ancestorName + ".";
			if (rhs.length <= 1) {
				rhsPrefix = `require(${luaPath})`;
			} else {
				rhsPrefix = this.getNewId();
				result += `${rhsPrefix} = require(${luaPath});\n`;
			}
			const lhsStr = lhs.map(v => lhsPrefix + v).join(", ");
			const rhsStr = rhs.map(v => rhsPrefix + v).join(", ");
			result += `${lhsStr} = ${rhsStr};\n`;
			return result;
		}
	}

	private transpileDoStatement(node: ts.DoStatement) {
		const condition = this.transpileExpression(node.getExpression());
		let result = "";
		result += this.indent + "repeat\n";
		this.pushIndent();
		result += this.transpileLoopBody(node.getStatement());
		this.popIndent();
		result += this.indent + `until not (${condition});\n`;
		return result;
	}

	private transpileIfStatement(node: ts.IfStatement) {
		let result = "";
		const expStr = this.transpileExpression(node.getExpression());
		result += this.indent + `if ${expStr} then\n`;
		this.pushIndent();
		result += this.transpileStatement(node.getThenStatement());
		this.popIndent();
		let elseStatement = node.getElseStatement();
		while (elseStatement && ts.TypeGuards.isIfStatement(elseStatement)) {
			const elseIfExpression = this.transpileExpression(elseStatement.getExpression());
			result += this.indent + `elseif ${elseIfExpression} then\n`;
			this.pushIndent();
			result += this.transpileStatement(elseStatement.getThenStatement());
			this.popIndent();
			elseStatement = elseStatement.getElseStatement();
		}
		if (elseStatement) {
			result += this.indent + "else\n";
			this.pushIndent();
			result += this.transpileStatement(elseStatement);
			this.popIndent();
		}
		result += this.indent + `end;\n`;
		return result;
	}

	private transpileBreakStatement(node: ts.BreakStatement) {
		if (node.getLabel()) {
			throw new TranspilerError("Break labels are not supported!", node);
		}
		return this.indent + "break;\n";
	}

	private transpileExpressionStatement(node: ts.ExpressionStatement) {
		// big set of rules for expression statements
		const expression = node.getExpression();
		if (
			!ts.TypeGuards.isCallExpression(expression) &&
			!ts.TypeGuards.isNewExpression(expression) &&
			!ts.TypeGuards.isAwaitExpression(expression) &&
			!ts.TypeGuards.isPostfixUnaryExpression(expression) &&
			!(
				ts.TypeGuards.isPrefixUnaryExpression(expression) &&
				(expression.getOperatorToken() === ts.SyntaxKind.PlusPlusToken ||
					expression.getOperatorToken() === ts.SyntaxKind.MinusMinusToken)
			) &&
			!(
				ts.TypeGuards.isBinaryExpression(expression) &&
				(expression.getOperatorToken().getKind() === ts.SyntaxKind.EqualsToken ||
					expression.getOperatorToken().getKind() === ts.SyntaxKind.PlusEqualsToken ||
					expression.getOperatorToken().getKind() === ts.SyntaxKind.MinusEqualsToken ||
					expression.getOperatorToken().getKind() === ts.SyntaxKind.AsteriskEqualsToken ||
					expression.getOperatorToken().getKind() === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
					expression.getOperatorToken().getKind() === ts.SyntaxKind.SlashEqualsToken ||
					expression.getOperatorToken().getKind() === ts.SyntaxKind.PercentEqualsToken)
			)
		) {
			throw new TranspilerError(
				"Expression statements must be variable assignments or function calls.",
				expression,
			);
		}
		return this.indent + this.transpileExpression(expression) + ";\n";
	}

	private transpileLoopBody(node: ts.Statement) {
		const hasContinue = this.hasContinue(node);

		let result = "";
		if (hasContinue) {
			this.continueId++;
			result += this.indent + `local _continue_${this.continueId} = false;\n`;
			result += this.indent + `repeat\n`;
			this.pushIndent();
		}

		result += this.transpileStatement(node);

		if (hasContinue) {
			result += this.indent + `_continue_${this.continueId} = true;\n`;
			this.popIndent();
			result += this.indent + `until true;\n`;
			result += this.indent + `if not _continue_${this.continueId} then\n`;
			this.pushIndent();
			result += this.indent + `break;\n`;
			this.popIndent();
			result += this.indent + `end\n`;
			this.continueId--;
		}

		return result;
	}

	private transpileContinueStatement(node: ts.ContinueStatement) {
		if (node.getLabel()) {
			throw new TranspilerError("Continue labels are not supported!", node);
		}
		return this.indent + `_continue_${this.continueId} = true; break;\n`;
	}

	private transpileForInStatement(node: ts.ForInStatement) {
		this.pushIdStack();
		const init = node.getInitializer();
		let varName = "";
		const initializers = new Array<string>();
		if (ts.TypeGuards.isVariableDeclarationList(init)) {
			for (const declaration of init.getDeclarations()) {
				const lhs = declaration.getChildAtIndex(0);
				if (isBindingPattern(lhs)) {
					throw new TranspilerError(`ForIn Loop did not expect binding pattern!`, init);
				} else if (ts.TypeGuards.isIdentifier(lhs)) {
					varName = lhs.getText();
				}
			}
		} else if (ts.TypeGuards.isExpression(init)) {
			const initKindName = init.getKindName();
			throw new TranspilerError(`ForIn Loop did not expect expression initializer! (${initKindName})`, init);
		}

		if (varName.length === 0) {
			throw new TranspilerError(`ForIn Loop empty varName!`, init);
		}

		const expStr = this.transpileExpression(node.getExpression());
		let result = "";
		result += this.indent + `for ${varName} in pairs(${expStr}) do\n`;
		this.pushIndent();
		initializers.forEach(initializer => (result += this.indent + initializer + "\n"));
		result += this.transpileLoopBody(node.getStatement());
		this.popIndent();
		result += this.indent + `end;\n`;
		this.popIdStack();
		return result;
	}

	private transpileForOfStatement(node: ts.ForOfStatement) {
		this.pushIdStack();
		const initializer = node.getInitializer();
		let varName = "";
		const initializers = new Array<string>();
		if (ts.TypeGuards.isVariableDeclarationList(initializer)) {
			for (const declaration of initializer.getDeclarations()) {
				const lhs = declaration.getChildAtIndex(0);
				if (isBindingPattern(lhs)) {
					varName = this.getNewId();
					const names = new Array<string>();
					const values = new Array<string>();
					const preStatements = new Array<string>();
					const postStatements = new Array<string>();
					this.getBindingData(names, values, preStatements, postStatements, lhs, varName);
					preStatements.forEach(statement => initializers.push(statement));
					const namesStr = names.join(", ");
					const valuesStr = values.join(", ");
					initializers.push(`local ${namesStr} = ${valuesStr};\n`);
					postStatements.forEach(statement => initializers.push(statement));
				} else if (ts.TypeGuards.isIdentifier(lhs)) {
					varName = lhs.getText();
				}
			}
		} else if (ts.TypeGuards.isExpression(initializer)) {
			const initKindName = initializer.getKindName();
			throw new TranspilerError(
				`ForOf Loop did not expect expression initializer! (${initKindName})`,
				initializer,
			);
		}

		if (varName.length === 0) {
			throw new TranspilerError(`ForOf Loop empty varName!`, initializer);
		}

		const expStr = this.transpileExpression(node.getExpression());
		let result = "";
		result += this.indent + `for _, ${varName} in pairs(${expStr}) do\n`;
		this.pushIndent();
		initializers.forEach(init => (result += this.indent + init));
		result += this.transpileLoopBody(node.getStatement());
		this.popIndent();
		result += this.indent + `end;\n`;
		this.popIdStack();
		return result;
	}

	private transpileForStatement(node: ts.ForStatement) {
		const condition = node.getCondition();
		const conditionStr = condition ? this.transpileExpression(condition) : "true";
		const incrementor = node.getIncrementor();
		const incrementorStr = incrementor ? this.transpileExpression(incrementor) + ";\n" : undefined;

		let result = "";
		result += this.indent + "do\n";
		this.pushIndent();
		const initializer = node.getInitializer();
		if (initializer) {
			if (ts.TypeGuards.isVariableDeclarationList(initializer)) {
				result += this.transpileVariableDeclarationList(initializer);
			} else if (ts.TypeGuards.isExpression(initializer)) {
				let expStr = this.transpileExpression(initializer);
				if (
					!ts.TypeGuards.isVariableDeclarationList(initializer) &&
					!ts.TypeGuards.isCallExpression(initializer)
				) {
					expStr = `local _ = ` + expStr;
				}
				result += this.indent + expStr + ";\n";
			}
		}
		result += this.indent + `while ${conditionStr} do\n`;
		this.pushIndent();
		result += this.transpileLoopBody(node.getStatement());
		if (incrementorStr) {
			result += this.indent + incrementorStr;
		}
		this.popIndent();
		result += this.indent + "end;\n";
		this.popIndent();
		result += this.indent + `end;\n`;
		return result;
	}

	private transpileReturnStatement(node: ts.ReturnStatement) {
		const exp = node.getExpression();
		if (exp && ts.TypeGuards.isArrayLiteralExpression(exp)) {
			let expStr = this.transpileExpression(exp);
			expStr = expStr.substr(2, expStr.length - 4);
			return this.indent + `return ${expStr};\n`;
		}

		if (exp) {
			const expStr = this.transpileExpression(exp);
			return this.indent + `return ${expStr};\n`;
		} else {
			return this.indent + `return;\n`;
		}
	}

	private transpileThrowStatement(node: ts.ThrowStatement) {
		const expStr = this.transpileExpression(node.getExpressionOrThrow());
		return this.indent + `error(${expStr});\n`;
	}

	private transpileVariableDeclarationList(node: ts.VariableDeclarationList) {
		if (node.getDeclarationKind() === ts.VariableDeclarationKind.Var) {
			throw new TranspilerError("'var' keyword is not supported! Use 'let' or 'const' instead.", node);
		}
		const names = new Array<string>();
		const values = new Array<string>();
		const preStatements = new Array<string>();
		const postStatements = new Array<string>();
		const declarations = node.getDeclarations();

		if (declarations.length === 1) {
			const declaration = declarations[0];
			const lhs = declaration.getChildAtIndex(0);
			const equalsToken = declaration.getFirstChildByKind(ts.SyntaxKind.EqualsToken);

			let rhs: ts.Node | undefined;
			if (equalsToken) {
				rhs = equalsToken.getNextSibling();
			}

			if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
				const isFlatBinding = lhs
					.getElements()
					.filter(v => ts.TypeGuards.isBindingElement(v))
					.every(bindingElement => {
						return bindingElement.getChildAtIndex(0).getKind() === ts.SyntaxKind.Identifier;
					});
				if (isFlatBinding && rhs && ts.TypeGuards.isCallExpression(rhs)) {
					lhs.getElements().forEach(v => names.push(v.getChildAtIndex(0).getText()));
					values.push(this.transpileExpression(rhs as ts.Expression));
					const flatNamesStr = names.join(", ");
					const flatValuesStr = values.join(", ");
					return this.indent + `local ${flatNamesStr} = ${flatValuesStr};\n`;
				}
			}
		}

		for (const declaration of declarations) {
			const lhs = declaration.getChildAtIndex(0);
			const equalsToken = declaration.getFirstChildByKind(ts.SyntaxKind.EqualsToken);

			let rhs: ts.Node | undefined;
			if (equalsToken) {
				rhs = equalsToken.getNextSibling();
			}

			if (lhs.getKind() === ts.SyntaxKind.Identifier) {
				const name = lhs.getText();
				this.checkReserved(name, lhs);
				names.push(name);
				if (rhs) {
					const rhsStr = this.transpileExpression(rhs as ts.Expression);
					if (ts.TypeGuards.isCallExpression(rhs) && rhs.getReturnType().isTuple()) {
						values.push(`{ ${rhsStr} }`);
					} else {
						values.push(rhsStr);
					}
				} else {
					values.push("nil");
				}
			} else if (isBindingPattern(lhs)) {
				if (rhs && ts.TypeGuards.isIdentifier(rhs)) {
					const rhsStr = this.transpileExpression(rhs);
					this.getBindingData(names, values, preStatements, postStatements, lhs, rhsStr);
				} else {
					const rootId = this.getNewId();
					if (rhs) {
						let rhsStr = this.transpileExpression(rhs as ts.Expression);
						if (ts.TypeGuards.isCallExpression(rhs) && rhs.getReturnType().isTuple()) {
							rhsStr = `{ ${rhsStr} }`;
						}
						preStatements.push(`local ${rootId} = ${rhsStr};`);
					} else {
						preStatements.push(`local ${rootId};`); // ???
					}
					this.getBindingData(names, values, preStatements, postStatements, lhs, rootId);
				}
			}
		}
		while (values[values.length - 1] === "nil") {
			values.pop();
		}

		const parent = node.getParent();
		if (parent && ts.TypeGuards.isVariableStatement(parent)) {
			names.forEach(name => this.pushExport(name, parent));
		}

		let result = "";
		preStatements.forEach(structStatement => (result += this.indent + structStatement + "\n"));
		const namesStr = names.join(", ");
		if (values.length > 0) {
			const valuesStr = values.join(", ");
			result += this.indent + `local ${namesStr} = ${valuesStr};\n`;
		} else {
			result += this.indent + `local ${namesStr};\n`;
		}
		postStatements.forEach(structStatement => (result += this.indent + structStatement + "\n"));
		return result;
	}

	private transpileVariableStatement(node: ts.VariableStatement) {
		const list = node.getFirstChildByKindOrThrow(ts.SyntaxKind.VariableDeclarationList);
		return this.transpileVariableDeclarationList(list);
	}

	private transpileWhileStatement(node: ts.WhileStatement) {
		const expStr = this.transpileExpression(node.getExpression());
		let result = "";
		result += this.indent + `while ${expStr} do\n`;
		this.pushIndent();
		result += this.transpileLoopBody(node.getStatement());
		this.popIndent();
		result += this.indent + `end;\n`;
		return result;
	}

	private transpileFunctionDeclaration(node: ts.FunctionDeclaration) {
		const name = node.getNameOrThrow();
		this.checkReserved(name, node);
		this.pushExport(name, node);
		const body = node.getBody();
		if (!body) {
			return "";
		}
		this.hoistStack[this.hoistStack.length - 1].push(name);
		const paramNames = new Array<string>();
		const initializers = new Array<string>();
		this.pushIdStack();
		this.getParameterData(paramNames, initializers, node);
		const paramStr = paramNames.join(", ");
		let result = "";
		if (node.isAsync()) {
			result += this.indent + `${name} = TS.async(function(${paramStr})\n`;
		} else {
			result += this.indent + `${name} = function(${paramStr})\n`;
		}
		this.pushIndent();
		if (ts.TypeGuards.isBlock(body)) {
			initializers.forEach(initializer => (result += this.indent + initializer + "\n"));
			result += this.transpileBlock(body);
		}
		this.popIndent();
		this.popIdStack();
		if (node.isAsync()) {
			result += this.indent + "end);\n";
		} else {
			result += this.indent + "end;\n";
		}
		return result;
	}

	private transpileClassDeclaration(node: ts.ClassDeclaration) {
		if (node.hasDeclareKeyword()) {
			return "";
		}

		const name = node.getName() || this.getNewId();
		const nameNode = node.getNameNode();
		if (nameNode) {
			this.checkReserved(name, nameNode);
		}
		this.pushExport(name, node);
		const baseClass = node.getBaseClass();
		const baseClassName = baseClass ? baseClass.getName() : "";

		this.hoistStack[this.hoistStack.length - 1].push(name);

		let result = "";
		result += this.indent + `do\n`;
		this.pushIndent();

		const id = name;

		result += this.indent + `${id} = {};\n`;

		if (baseClassName) {
			result += this.indent + `${id}.__index = setmetatable({`;
		} else {
			result += this.indent + `${id}.__index = {`;
		}

		this.pushIndent();
		let hasIndexMembers = false;

		const extraInitializers = new Array<string>();
		const instanceProps = node
			.getInstanceProperties()
			.filter(prop => prop.getParent() === node)
			.filter(prop => !ts.TypeGuards.isGetAccessorDeclaration(prop))
			.filter(prop => !ts.TypeGuards.isSetAccessorDeclaration(prop));
		for (const prop of instanceProps) {
			const propName = prop.getName();
			if (propName) {
				this.checkMethodReserved(propName, prop);

				if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
					const initializer = prop.getInitializer();
					if (initializer) {
						extraInitializers.push(`self.${propName} = ${this.transpileExpression(initializer)};\n`);
					}
				}
			}
		}

		node.getMethods()
			.filter(method => method.getBody() !== undefined)
			.forEach(method => {
				if (!hasIndexMembers) {
					hasIndexMembers = true;
					result += "\n";
				}
				result += this.transpileMethodDeclaration(id, method);
			});

		this.popIndent();

		if (baseClassName) {
			result += `${((hasIndexMembers) ? this.indent : "")}}, ${baseClassName});\n`;
		} else {
			result += `${((hasIndexMembers) ? this.indent : "")}};\n`;
		}

		LUA_RESERVED_METAMETHODS.forEach(metamethod => {
			if (getClassMethod(node, metamethod)) {
				if (LUA_UNDEFINABLE_METAMETHODS.indexOf(metamethod) !== -1) {
					throw new TranspilerError(`Cannot use undefinable Lua metamethod as identifier '${metamethod}' for a class`, node);
				}
				result += this.indent + `${id}.${metamethod} = function(self, ...) return self:${metamethod}(...); end;\n`;
			}
		});

		if (!node.isAbstract()) {
			result += this.indent + `${id}.new = function(...)\n`;
			this.pushIndent();
			result += this.indent + `return ${id}.constructor(setmetatable({}, ${id}), ...);\n`;
			this.popIndent();
			result += this.indent + `end;\n`;
		}

		result += this.transpileConstructorDeclaration(id, getConstructor(node), extraInitializers, baseClassName);

		for (const prop of node.getStaticProperties()) {
			const propName = prop.getName();
			this.checkMethodReserved(propName, prop);

			let propValue = "nil";
			if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
				const initializer = prop.getInitializer();
				if (initializer) {
					propValue = this.transpileExpression(initializer);
				}
			}
			result += this.indent + `${id}.${propName} = ${propValue};\n`;
		}

		const getters = node
			.getInstanceProperties()
			.filter((prop): prop is ts.GetAccessorDeclaration => ts.TypeGuards.isGetAccessorDeclaration(prop));
		let ancestorHasGetters = false;
		let ancestorClass: ts.ClassDeclaration | undefined = node;
		while (!ancestorHasGetters && ancestorClass !== undefined) {
			ancestorClass = ancestorClass.getBaseClass();
			if (ancestorClass !== undefined) {
				const ancestorGetters = ancestorClass
					.getInstanceProperties()
					.filter((prop): prop is ts.GetAccessorDeclaration => ts.TypeGuards.isGetAccessorDeclaration(prop));
				if (ancestorGetters.length > 0) {
					ancestorHasGetters = true;
				}
			}
		}

		if (getters.length > 0 || ancestorHasGetters) {
			if (getters.length > 0) {
				let getterContent = "\n";
				this.pushIndent();
				for (const getter of getters) {
					getterContent += this.transpileAccessorDeclaration(getter, getter.getName());
				}
				this.popIndent();
				getterContent += this.indent;
				if (ancestorHasGetters) {
					result +=
						this.indent + `${id}._getters = setmetatable({${getterContent}}, { __index = ${baseClassName}._getters });\n`;
				} else {
					result += this.indent + `${id}._getters = {${getterContent}};\n`;
				}
			} else {
				result += this.indent + `${id}._getters = ${baseClassName}._getters;\n`;
			}
			result += this.indent + `local __index = ${id}.__index;\n`;
			result += this.indent + `${id}.__index = function(self, index)\n`;
			this.pushIndent();
			result += this.indent + `local getter = ${id}._getters[index];\n`;
			result += this.indent + `if getter then\n`;
			this.pushIndent();
			result += this.indent + `return getter(self);\n`;
			this.popIndent();
			result += this.indent + `else\n`;
			this.pushIndent();
			result += this.indent + `return __index[index];\n`;
			this.popIndent();
			result += this.indent + `end;\n`;
			this.popIndent();
			result += this.indent + `end;\n`;
		}

		const setters = node
			.getInstanceProperties()
			.filter((prop): prop is ts.SetAccessorDeclaration => ts.TypeGuards.isSetAccessorDeclaration(prop));
		let ancestorHasSetters = false;
		ancestorClass = node;
		while (!ancestorHasSetters && ancestorClass !== undefined) {
			ancestorClass = ancestorClass.getBaseClass();
			if (ancestorClass !== undefined) {
				const ancestorSetters = ancestorClass
					.getInstanceProperties()
					.filter((prop): prop is ts.GetAccessorDeclaration => ts.TypeGuards.isSetAccessorDeclaration(prop));
				if (ancestorSetters.length > 0) {
					ancestorHasSetters = true;
				}
			}
		}
		if (setters.length > 0 || ancestorHasSetters) {
			if (setters.length > 0) {
				let setterContent = "\n";
				this.pushIndent();
				for (const setter of setters) {
					setterContent += this.transpileAccessorDeclaration(setter, setter.getName());
				}
				this.popIndent();
				setterContent += this.indent;
				if (ancestorHasSetters) {
					result +=
						this.indent + `${id}._setters = setmetatable({${setterContent}}, { __index = ${baseClassName}._setters });\n`;
				} else {
					result += this.indent + `${id}._setters = {${setterContent}};\n`;
				}
			} else {
				result += this.indent + `${id}._setters = ${baseClassName}._setters;\n`;
			}
			result += this.indent + `${id}.__newindex = function(self, index, value)\n`;
			this.pushIndent();
			result += this.indent + `local setter = ${id}._setters[index];\n`;
			result += this.indent + `if setter then\n`;
			this.pushIndent();
			result += this.indent + `setter(self, value);\n`;
			this.popIndent();
			result += this.indent + `else\n`;
			this.pushIndent();
			result += this.indent + `rawset(self, index, value);\n`;
			this.popIndent();
			result += this.indent + `end;\n`;
			this.popIndent();
			result += this.indent + `end;\n`;
		}

		this.popIndent();
		result += this.indent + `end;\n`;

		return result;
	}

	private transpileConstructorDeclaration(
		className: string,
		node?: ts.ConstructorDeclaration,
		extraInitializers?: Array<string>,
		baseClassName?: string,
	) {
		const paramNames = new Array<string>();
		paramNames.push("self");
		const initializers = new Array<string>();
		const defaults = new Array<string>();

		this.pushIdStack();
		if (node) {
			this.getParameterData(paramNames, initializers, node, defaults);
		} else {
			paramNames.push("...");
		}
		const paramStr = paramNames.join(", ");

		let result = "";
		result += this.indent + `${className}.constructor = function(${paramStr})\n`;
		this.pushIndent();

		if (node) {
			const body = node.getBodyOrThrow();
			if (ts.TypeGuards.isBlock(body)) {
				defaults.forEach(initializer => (result += this.indent + initializer + "\n"));

				const bodyStatements = body.getStatements();
				let k = 0;

				if (this.containsSuperExpression(bodyStatements[k])) {
					result += this.transpileStatement(bodyStatements[k++]);
				}

				initializers.forEach(initializer => (result += this.indent + initializer + "\n"));

				if (extraInitializers) {
					extraInitializers.forEach(initializer => (result += this.indent + initializer));
				}

				for (; k < bodyStatements.length; ++k) {
					result += this.transpileStatement(bodyStatements[k]);
				}

				const returnStatement = node.getStatementByKind(ts.SyntaxKind.ReturnStatement);

				if (returnStatement) {
					throw new TranspilerError(
						`Cannot use return statement in constructor for ${className}`,
						returnStatement,
					);
				}
			}
		} else {
			if (baseClassName) {
				result += this.indent + `${baseClassName}.constructor(self, ...);\n`;
			}
			if (extraInitializers) {
				extraInitializers.forEach(initializer => (result += this.indent + initializer));
			}
		}
		result += this.indent + "return self;\n";
		this.popIndent();
		this.popIdStack();
		result += this.indent + "end;\n";
		return result;
	}

	private transpileAccessorDeclaration(
		node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
		name: string,
	) {
		const body = node.getBody();
		const paramNames = new Array<string>();
		paramNames.push("self");
		const initializers = new Array<string>();
		this.pushIdStack();
		this.getParameterData(paramNames, initializers, node);
		const paramStr = paramNames.join(", ");
		let result = "";
		result += this.indent + `${name} = function(${paramStr})\n`;
		this.pushIndent();
		if (ts.TypeGuards.isBlock(body)) {
			initializers.forEach(initializer => (result += this.indent + initializer + "\n"));
			result += this.transpileBlock(body);
		}
		this.popIndent();
		this.popIdStack();
		result += this.indent + "end;\n";
		return result;
	}

	private transpileMethodDeclaration(className: string, node: ts.MethodDeclaration) {
		const name = node.getName();
		this.checkReserved(name, node);
		const body = node.getBodyOrThrow();

		const paramNames = new Array<string>();
		paramNames.push("self");
		const initializers = new Array<string>();
		this.pushIdStack();
		this.getParameterData(paramNames, initializers, node);
		const paramStr = paramNames.join(", ");

		let result = "";
		if (node.isAsync()) {
			result += this.indent + `${name} = TS.async(function(${paramStr})\n`;
		} else {
			result += this.indent + `${name} = function(${paramStr})\n`;
		}
		this.pushIndent();
		if (ts.TypeGuards.isBlock(body)) {
			initializers.forEach(initializer => (result += this.indent + initializer + "\n"));
			result += this.transpileBlock(body);
		}
		this.popIndent();
		this.popIdStack();
		result += this.indent + "end" + (node.isAsync() ? ")" : "") + ";\n";
		return result;
	}

	private transpileNamespaceDeclaration(node: ts.NamespaceDeclaration) {
		if (node.hasDeclareKeyword()) {
			return "";
		}

		const name = node.getName();
		this.checkReserved(name, node);
		this.pushExport(name, node);
		let result = "";
		result += this.indent + `local ${name} = {} do\n`;
		this.pushIndent();
		result += this.transpileStatementedNode(node);
		this.popIndent();
		result += this.indent + `end;\n`;
		return result;
	}

	private transpileEnumDeclaration(node: ts.EnumDeclaration) {
		let result = "";
		if (node.isConstEnum()) {
			return result;
		}
		const name = node.getName();
		this.checkReserved(name, node.getNameNode());
		this.pushExport(name, node);
		const hoistStack = this.hoistStack[this.hoistStack.length - 1];
		if (hoistStack.indexOf(name) === -1) {
			hoistStack.push(name);
		}
		result += this.indent + `${name} = ${name} or {};\n`;
		result += this.indent + `do\n`;
		this.pushIndent();
		let last = 0;
		for (const member of node.getMembers()) {
			const memberName = member.getName();
			this.checkReserved(memberName, member.getNameNode());
			const memberValue = member.getValue();
			const safeIndex = safeLuaIndex(name, memberName);
			if (typeof memberValue === "string") {
				result += this.indent + `${safeIndex} = "${memberValue}";\n`;
			} else if (typeof memberValue === "number") {
				result += this.indent + `${safeIndex} = ${memberValue};\n`;
				result += this.indent + `${name}[${memberValue}] = "${memberName}";\n`;
				last = memberValue + 1;
			} else {
				result += this.indent + `${safeIndex} = ${last};\n`;
				result += this.indent + `${name}[${last}] = "${memberName}";\n`;
				last++;
			}
		}
		this.popIndent();
		result += this.indent + `end\n`;
		return result;
	}

	private transpileExportAssignment(node: ts.ExportAssignment) {
		let result = "";
		if (node.isExportEquals()) {
			this.isModule = true;
			const expStr = this.transpileExpression(node.getExpression());
			result = this.indent + `_exports = ${expStr};\n`;
		}
		return result;
	}

	private transpileSwitchStatement(node: ts.SwitchStatement) {
		const expStr = this.transpileExpression(node.getExpression());
		let result = "";
		result += this.indent + `repeat\n`;
		this.pushIndent();
		this.pushIdStack();
		const fallThroughVar = this.getNewId();
		result += this.indent + `local ${fallThroughVar} = false;\n`;
		for (const clause of node.getCaseBlock().getClauses()) {
			// add if statement if the clause is non-default
			if (ts.TypeGuards.isCaseClause(clause)) {
				const clauseExpStr = this.transpileExpression(clause.getExpression());
				result += this.indent + `if ${fallThroughVar} or ${expStr} == ( ${clauseExpStr} ) then\n`;
				this.pushIndent();
			}

			const statements = clause.getStatements();
			const lastChild = statements[statements.length - 1];
			const endsInReturnStatement = lastChild && lastChild.getKind() === ts.SyntaxKind.ReturnStatement;

			result += this.transpileStatementedNode(clause);

			if (ts.TypeGuards.isCaseClause(clause)) {
				if (!endsInReturnStatement) {
					result += this.indent + `${fallThroughVar} = true;\n`;
				}
				this.popIndent();
				result += this.indent + `end;\n`;
			}
		}
		this.popIdStack();
		this.popIndent();
		result += this.indent + `until true;\n`;
		return result;
	}

	private transpileExpression(node: ts.Expression, compress = false): string {
		if (ts.TypeGuards.isStringLiteral(node) || ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
			return this.transpileStringLiteral(node);
		} else if (ts.TypeGuards.isNumericLiteral(node)) {
			return this.transpileNumericLiteral(node);
		} else if (ts.TypeGuards.isBooleanLiteral(node)) {
			return this.transpileBooleanLiteral(node);
		} else if (ts.TypeGuards.isArrayLiteralExpression(node)) {
			return this.transpileArrayLiteralExpression(node);
		} else if (ts.TypeGuards.isObjectLiteralExpression(node)) {
			return this.transpileObjectLiteralExpression(node, compress);
		} else if (ts.TypeGuards.isFunctionExpression(node) || ts.TypeGuards.isArrowFunction(node)) {
			return this.transpileFunctionExpression(node);
		} else if (ts.TypeGuards.isCallExpression(node)) {
			return this.transpileCallExpression(node);
		} else if (ts.TypeGuards.isIdentifier(node)) {
			return this.transpileIdentifier(node);
		} else if (ts.TypeGuards.isBinaryExpression(node)) {
			return this.transpileBinaryExpression(node);
		} else if (ts.TypeGuards.isPrefixUnaryExpression(node)) {
			return this.transpilePrefixUnaryExpression(node);
		} else if (ts.TypeGuards.isPostfixUnaryExpression(node)) {
			return this.transpilePostfixUnaryExpression(node);
		} else if (ts.TypeGuards.isPropertyAccessExpression(node)) {
			return this.transpilePropertyAccessExpression(node);
		} else if (ts.TypeGuards.isNewExpression(node)) {
			return this.transpileNewExpression(node);
		} else if (ts.TypeGuards.isParenthesizedExpression(node)) {
			return this.transpileParenthesizedExpression(node);
		} else if (ts.TypeGuards.isTemplateExpression(node)) {
			return this.transpileTemplateExpression(node);
		} else if (ts.TypeGuards.isElementAccessExpression(node)) {
			return this.transpileElementAccessExpression(node);
		} else if (ts.TypeGuards.isAwaitExpression(node)) {
			return this.transpileAwaitExpression(node);
		} else if (ts.TypeGuards.isConditionalExpression(node)) {
			return this.transpileConditionalExpression(node);
		} else if (ts.TypeGuards.isTypeOfExpression(node)) {
			return this.transpileTypeOfExpression(node);
		} else if (ts.TypeGuards.isSpreadElement(node)) {
			return this.transpileSpreadElement(node);
		} else if (ts.TypeGuards.isThisExpression(node)) {
			if (!node.getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration)) {
				throw new TranspilerError("'this' may only be used inside a class definition", node);
			}
			return "self";
		} else if (ts.TypeGuards.isSuperExpression(node)) {
			return this.transpileSuperExpression(node);
		} else if (
			ts.TypeGuards.isAsExpression(node) ||
			ts.TypeGuards.isTypeAssertion(node) ||
			ts.TypeGuards.isNonNullExpression(node)
		) {
			return this.transpileExpression(node.getExpression());
		} else if (ts.TypeGuards.isNullLiteral(node)) {
			throw new TranspilerError("'null' is not supported! Use 'undefined' instead.", node);
		} else {
			const kindName = node.getKindName();
			throw new TranspilerError(`Bad expression! (${kindName})`, node);
		}
	}

	private transpileStringLiteral(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral) {
		let text = node.getText();
		if (text.startsWith("`") && text.endsWith("`")) {
			text = text.slice(1, -1).replace(/"/g, '\\"');
			text = `"${text}"`;
		}

		return text;
	}

	private transpileNumericLiteral(node: ts.NumericLiteral) {
		return node.getLiteralValue().toString();
	}

	private transpileBooleanLiteral(node: ts.BooleanLiteral) {
		return node.getLiteralValue() === true ? "true" : "false";
	}

	private transpileArrayLiteralExpression(node: ts.ArrayLiteralExpression) {
		const elements = node.getElements();
		if (elements.length === 0) {
			return "{}";
		}
		const params = elements.map(element => this.transpileExpression(element)).join(", ");
		return `{ ${params} }`;
	}

	private transpileObjectLiteralExpression(node: ts.ObjectLiteralExpression, compress: boolean) {
		const properties = node.getProperties();
		if (properties.length === 0) {
			return "{}";
		}
		let result = "";
		if (compress) {
			const fields = new Array<string>();
			properties.forEach(property => {
				if (ts.TypeGuards.isPropertyAssignment(property)) {
					const lhs = property.getName();
					this.checkReserved(lhs, property);
					const rhs = this.transpileExpression(property.getInitializerOrThrow(), compress);
					fields.push(`${lhs} = ${rhs}`);
				} else if (ts.TypeGuards.isShorthandPropertyAssignment(property)) {
					const name = property.getName();
					this.checkReserved(name, property);
					fields.push(`${name} = ${name}`);
				} else if (ts.TypeGuards.isSpreadAssignment(property)) {
					throw new TranspilerError("Spread operator `...` is not supported in object literals!", property);
				}
			});
			const fieldsStr = fields.join(", ");
			result += `{ ${fieldsStr} }`;
		} else {
			result += `{\n`;
			this.pushIndent();
			properties.forEach(property => {
				if (ts.TypeGuards.isPropertyAssignment(property)) {
					const lhs = property.getName();
					this.checkReserved(lhs, property);
					const rhs = this.transpileExpression(property.getInitializerOrThrow(), compress);
					result += this.indent + `${lhs} = ${rhs},\n`;
				} else if (ts.TypeGuards.isShorthandPropertyAssignment(property)) {
					const name = property.getName();
					this.checkReserved(name, property);
					result += this.indent + `${name} = ${name},\n`;
				} else if (ts.TypeGuards.isSpreadAssignment(property)) {
					throw new TranspilerError("Spread operator `...` is not supported in object literals!", property);
				}
			});
			this.popIndent();
			result += this.indent + "}";
		}
		return result;
	}

	private transpileFunctionExpression(node: ts.FunctionExpression | ts.ArrowFunction) {
		const body = node.getBody();
		const paramNames = new Array<string>();
		const initializers = new Array<string>();
		this.pushIdStack();
		this.getParameterData(paramNames, initializers, node);
		const paramStr = paramNames.join(", ");
		let result = "";
		result += `function(${paramStr})`;
		if (ts.TypeGuards.isBlock(body)) {
			result += "\n";
			this.pushIndent();
			initializers.forEach(initializer => (result += this.indent + initializer + "\n"));
			result += this.transpileBlock(body);
			this.popIndent();
			result += this.indent + "end";
		} else if (ts.TypeGuards.isExpression(body)) {
			if (initializers.length > 0) {
				result += " ";
			}
			const expStr = this.transpileExpression(body);
			initializers.push(`return ${expStr};`);
			const initializersStr = initializers.join(" ");
			result += ` ${initializersStr} end`;
		} else {
			const bodyKindName = body.getKindName();
			throw new TranspilerError(`Bad function body (${bodyKindName})`, node);
		}
		if (node.isAsync()) {
			result = `TS.async(${result})`;
		}
		this.popIdStack();
		return result;
	}

	private transpileCallExpression(node: ts.CallExpression) {
		const exp = node.getExpression();
		if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
			return this.transpilePropertyCallExpression(node);
		} else if (ts.TypeGuards.isSuperExpression(exp)) {
			let params = this.transpileArguments(node.getArguments() as Array<ts.Expression>);
			if (params.length > 0) {
				params = ", " + params;
			}
			params = "self" + params;
			const className = exp
				.getType()
				.getSymbolOrThrow()
				.getName();
			return `${className}.constructor(${params})`;
		} else {
			const callPath = this.transpileExpression(exp);
			const params = this.transpileArguments(node.getArguments() as Array<ts.Expression>);
			return `${callPath}(${params})`;
		}
	}

	private transpilePropertyCallExpression(node: ts.CallExpression) {
		const expression = node.getExpression();
		if (!ts.TypeGuards.isPropertyAccessExpression(expression)) {
			throw new TranspilerError("Expected PropertyAccessExpression", node);
		}
		const subExp = expression.getExpression();
		const subExpType = subExp.getType();
		let accessPath = this.transpileExpression(subExp);
		const property = expression.getName();
		let params = this.transpileArguments(node.getArguments() as Array<ts.Expression>);

		if (subExpType.isArray()) {
			let paramStr = accessPath;
			if (params.length > 0) {
				paramStr += ", " + params;
			}
			return `TS.array.${property}(${paramStr})`;
		}

		if (subExpType.isString() || subExpType.isStringLiteral()) {
			let paramStr = accessPath;
			if (params.length > 0) {
				paramStr += ", " + params;
			}
			if (STRING_MACRO_METHODS.indexOf(property) !== -1) {
				return `string.${property}(${paramStr})`;
			}
			return `TS.string.${property}(${paramStr})`;
		}

		const subExpTypeSym = subExpType.getSymbol();
		if (subExpTypeSym && ts.TypeGuards.isPropertyAccessExpression(expression)) {
			const subExpTypeName = subExpTypeSym.getEscapedName();

			// custom promises
			if (subExpTypeName === "Promise") {
				if (property === "then") {
					return `${accessPath}:andThen(${params})`;
				}
			}

			if (subExpTypeName === "Map" || subExpTypeName === "ReadonlyMap" || subExpTypeName === "WeakMap") {
				let paramStr = accessPath;
				if (params.length > 0) {
					paramStr += ", " + params;
				}
				return `TS.map.${property}(${paramStr})`;
			}

			if (subExpTypeName === "Set" || subExpTypeName === "ReadonlySet" || subExpTypeName === "WeakSet") {
				let paramStr = accessPath;
				if (params.length > 0) {
					paramStr += ", " + params;
				}
				return `TS.set.${property}(${paramStr})`;
			}

			const validateMathCall = () => {
				if (ts.TypeGuards.isExpressionStatement(node.getParent())) {
					throw new TranspilerError(
						`${subExpTypeName}.${property}() cannot be an expression statement!`,
						node,
					);
				}
			};

			// custom math
			if (RBX_MATH_CLASSES.indexOf(subExpTypeName) !== -1) {
				switch (property) {
					case "add":
						validateMathCall();
						return `(${accessPath} + ${params})`;
					case "sub":
						validateMathCall();
						return `(${accessPath} - ${params})`;
					case "mul":
						validateMathCall();
						return `(${accessPath} * ${params})`;
					case "div":
						validateMathCall();
						return `(${accessPath} / ${params})`;
				}
			}
		}

		const symbol = expression.getType().getSymbol();

		const isSuper = ts.TypeGuards.isSuperExpression(subExp);

		let sep = ".";
		if (
			symbol &&
			symbol
				.getDeclarations()
				.some(dec => ts.TypeGuards.isMethodDeclaration(dec) || ts.TypeGuards.isMethodSignature(dec))
		) {
			if (isSuper) {
				const className = subExp
					.getType()
					.getSymbolOrThrow()
					.getName();
				accessPath = className + ".__index";
				params = "self" + (params.length > 0 ? ", " : "") + params;
			} else {
				sep = ":";
			}
		}

		return `${accessPath}${sep}${property}(${params})`;
	}

	private transpileBinaryExpression(node: ts.BinaryExpression) {
		const opToken = node.getOperatorToken();
		const opKind = opToken.getKind();

		if (opKind === ts.SyntaxKind.CaretToken) {
			throw new TranspilerError("Binary XOR operator ( `^` ) is not supported! Did you mean to use `**`?", node);
		} else if (opKind === ts.SyntaxKind.CaretEqualsToken) {
			throw new TranspilerError("Binary XOR operator ( `^` ) is not supported! Did you mean to use `**=`?", node);
		}

		const lhs = node.getLeft();
		const rhs = node.getRight();
		let lhsStr: string;
		const rhsStr = this.transpileExpression(rhs);
		const statements = new Array<string>();

		function getOperandStr() {
			switch (opKind) {
				case ts.SyntaxKind.EqualsToken:
					return `${lhsStr} = ${rhsStr}`;
				case ts.SyntaxKind.PlusEqualsToken:
					const addExpStr = getLuaAddExpression(node, lhsStr, rhsStr, true);
					return `${lhsStr} = ${addExpStr}`;
				case ts.SyntaxKind.MinusEqualsToken:
					return `${lhsStr} = ${lhsStr} - (${rhsStr})`;
				case ts.SyntaxKind.AsteriskEqualsToken:
					return `${lhsStr} = ${lhsStr} * (${rhsStr})`;
				case ts.SyntaxKind.SlashEqualsToken:
					return `${lhsStr} = ${lhsStr} / (${rhsStr})`;
				case ts.SyntaxKind.AsteriskAsteriskEqualsToken:
					return `${lhsStr} = ${lhsStr} ^ (${rhsStr})`;
				case ts.SyntaxKind.PercentEqualsToken:
					return `${lhsStr} = ${lhsStr} % (${rhsStr})`;
			}
			throw new TranspilerError("Unrecognized operation!", node);
		}

		if (
			opKind === ts.SyntaxKind.EqualsToken ||
			opKind === ts.SyntaxKind.PlusEqualsToken ||
			opKind === ts.SyntaxKind.MinusEqualsToken ||
			opKind === ts.SyntaxKind.AsteriskEqualsToken ||
			opKind === ts.SyntaxKind.SlashEqualsToken ||
			opKind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
			opKind === ts.SyntaxKind.PercentEqualsToken
		) {
			if (ts.TypeGuards.isPropertyAccessExpression(lhs) && opKind !== ts.SyntaxKind.EqualsToken) {
				const expression = lhs.getExpression();
				const opExpStr = this.transpileExpression(expression);
				const propertyStr = lhs.getName();
				const id = this.getNewId();
				statements.push(`local ${id} = ${opExpStr}`);
				lhsStr = `${id}.${propertyStr}`;
			} else {
				lhsStr = this.transpileExpression(lhs);
			}
			statements.push(getOperandStr());
			const parentKind = node.getParentOrThrow().getKind();
			if (parentKind === ts.SyntaxKind.ExpressionStatement || parentKind === ts.SyntaxKind.ForStatement) {
				return statements.join("; ");
			} else {
				const statementsStr = statements.join("; ");
				return `(function() ${statementsStr}; return ${lhsStr}; end)()`;
			}
		} else {
			lhsStr = this.transpileExpression(lhs);
		}

		switch (opKind) {
			case ts.SyntaxKind.EqualsEqualsToken:
				throw new TranspilerError("operator '==' is not supported! Use '===' instead.", opToken);
			case ts.SyntaxKind.EqualsEqualsEqualsToken:
				return `${lhsStr} == ${rhsStr}`;
			case ts.SyntaxKind.ExclamationEqualsToken:
				throw new TranspilerError("operator '!=' is not supported! Use '!==' instead.", opToken);
			case ts.SyntaxKind.ExclamationEqualsEqualsToken:
				return `${lhsStr} ~= ${rhsStr}`;
			case ts.SyntaxKind.PlusToken:
				return getLuaAddExpression(node, lhsStr, rhsStr);
			case ts.SyntaxKind.MinusToken:
				return `${lhsStr} - ${rhsStr}`;
			case ts.SyntaxKind.AsteriskToken:
				return `${lhsStr} * ${rhsStr}`;
			case ts.SyntaxKind.SlashToken:
				return `${lhsStr} / ${rhsStr}`;
			case ts.SyntaxKind.AsteriskAsteriskToken:
				return `${lhsStr} ^ ${rhsStr}`;
			case ts.SyntaxKind.InKeyword:
				return `${rhsStr}[${lhsStr}] ~= nil`;
			case ts.SyntaxKind.AmpersandAmpersandToken:
				return `${lhsStr} and ${rhsStr}`;
			case ts.SyntaxKind.BarBarToken:
				return `${lhsStr} or ${rhsStr}`;
			case ts.SyntaxKind.GreaterThanToken:
				return `${lhsStr} > ${rhsStr}`;
			case ts.SyntaxKind.LessThanToken:
				return `${lhsStr} < ${rhsStr}`;
			case ts.SyntaxKind.GreaterThanEqualsToken:
				return `${lhsStr} >= ${rhsStr}`;
			case ts.SyntaxKind.LessThanEqualsToken:
				return `${lhsStr} <= ${rhsStr}`;
			case ts.SyntaxKind.PercentToken:
				return `${lhsStr} % ${rhsStr}`;
			case ts.SyntaxKind.InstanceOfKeyword:
				if (inheritsFrom(node.getRight().getType(), "Rbx_Instance")) {
					return `TS.isA(${lhsStr}, "${rhsStr}")`;
				} else if (isRbxClassType(node.getRight().getType())) {
					return `(TS.typeof(${lhsStr}) == "${rhsStr}")`;
				} else {
					return `TS.instanceof(${lhsStr}, ${rhsStr})`;
				}
			default:
				const opKindName = node.getOperatorToken().getKindName();
				throw new TranspilerError(`Bad binary expression! (${opKindName})`, opToken);
		}
	}

	private transpilePrefixUnaryExpression(node: ts.PrefixUnaryExpression) {
		const parent = node.getParentOrThrow();
		const operand = node.getOperand();

		let expStr: string;
		const statements = new Array<string>();

		const opKind = node.getOperatorToken();
		this.pushIdStack();
		if (
			(opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) &&
			ts.TypeGuards.isPropertyAccessExpression(operand)
		) {
			const expression = operand.getExpression();
			const opExpStr = this.transpileExpression(expression);
			const propertyStr = operand.getName();
			const id = this.getNewId();
			statements.push(`local ${id} = ${opExpStr}`);
			expStr = `${id}.${propertyStr}`;
		} else {
			expStr = this.transpileExpression(operand);
		}

		function getOperandStr() {
			switch (opKind) {
				case ts.SyntaxKind.PlusPlusToken:
					return `${expStr} = ${expStr} + 1`;
				case ts.SyntaxKind.MinusMinusToken:
					return `${expStr} = ${expStr} - 1`;
			}
			throw new TranspilerError("Unrecognized operation!", node);
		}

		if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
			statements.push(getOperandStr());
			const parentKind = parent.getKind();
			if (parentKind === ts.SyntaxKind.ExpressionStatement || parentKind === ts.SyntaxKind.ForStatement) {
				return statements.join("; ");
			} else {
				this.popIdStack();
				const statementsStr = statements.join("; ");
				return `(function() ${statementsStr}; return ${expStr}; end)()`;
			}
		}

		const tokenKind = node.getOperatorToken();
		switch (tokenKind) {
			case ts.SyntaxKind.ExclamationToken:
				return `not ${expStr}`;
			case ts.SyntaxKind.MinusToken:
				return `-${expStr}`;
		}
		throw new TranspilerError(`Bad prefix unary expression! (${tokenKind})`, node);
	}

	private transpilePostfixUnaryExpression(node: ts.PostfixUnaryExpression) {
		const parent = node.getParentOrThrow();
		const operand = node.getOperand();

		let expStr: string;
		const statements = new Array<string>();

		const opKind = node.getOperatorToken();
		this.pushIdStack();
		if (
			(opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) &&
			ts.TypeGuards.isPropertyAccessExpression(operand)
		) {
			const expression = operand.getExpression();
			const opExpStr = this.transpileExpression(expression);
			const propertyStr = operand.getName();
			const id = this.getNewId();
			statements.push(`local ${id} = ${opExpStr}`);
			expStr = `${id}.${propertyStr}`;
		} else {
			expStr = this.transpileExpression(operand);
		}

		function getOperandStr() {
			switch (opKind) {
				case ts.SyntaxKind.PlusPlusToken:
					return `${expStr} = ${expStr} + 1`;
				case ts.SyntaxKind.MinusMinusToken:
					return `${expStr} = ${expStr} - 1`;
			}
			throw new TranspilerError("Unrecognized operation!", node);
		}

		if (opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) {
			const parentKind = parent.getKind();
			if (parentKind === ts.SyntaxKind.ExpressionStatement || parentKind === ts.SyntaxKind.ForStatement) {
				statements.push(getOperandStr());
				return statements.join("; ");
			} else {
				const id = this.getNewId();
				this.popIdStack();
				statements.push(`local ${id} = ${expStr}`);
				statements.push(getOperandStr());
				const statementsStr = statements.join("; ");
				return `(function() ${statementsStr}; return ${id}; end)()`;
			}
		}
		throw new TranspilerError(`Bad postfix unary expression! (${opKind})`, node);
	}

	private transpileNewExpression(node: ts.NewExpression) {
		if (!node.getFirstChildByKind(ts.SyntaxKind.OpenParenToken)) {
			throw new TranspilerError("Parentheses-less new expressions not allowed!", node);
		}

		const expStr = node.getExpression();
		const expressionType = expStr.getType();
		let name = this.transpileExpression(expStr);
		const args = node.getArguments() as Array<ts.Expression>;
		const params = this.transpileArguments(args);

		if (RUNTIME_CLASSES.indexOf(name) !== -1) {
			name = `TS.${name}`;
		}

		if (expressionType.isObject()) {
			if (inheritsFrom(expressionType, "Rbx_Instance")) {
				const paramStr = params.length > 0 ? `, ${params}` : "";
				return `Instance.new("${name}"${paramStr})`;
			}

			if (inheritsFrom(expressionType, "ArrayConstructor")) {
				return "{}";
			}

			if (inheritsFrom(expressionType, "MapConstructor")) {
				if (args.length > 0) {
					return `TS.map.new(${params})`;
				} else {
					return "{}";
				}
			}

			if (inheritsFrom(expressionType, "SetConstructor")) {
				if (args.length > 0) {
					return `TS.set.new(${params})`;
				} else {
					return "{}";
				}
			}

			if (
				inheritsFrom(expressionType, "WeakMapConstructor") ||
				inheritsFrom(expressionType, "WeakSetConstructor")
			) {
				return `setmetatable({}, { __mode = "k" })`;
			}
		}

		return `${name}.new(${params})`;
	}

	private transpilePropertyAccessExpression(node: ts.PropertyAccessExpression) {
		const expression = node.getExpression();
		const expressionType = expression.getType();
		const expStr = this.transpileExpression(expression);
		const propertyStr = node.getName();

		if (ts.TypeGuards.isSuperExpression(expression)) {
			const baseClassName = expression
				.getType()
				.getSymbolOrThrow()
				.getName();
			const indexA = safeLuaIndex(`${baseClassName}._getters`, propertyStr);
			const indexB = safeLuaIndex("self", propertyStr);
			return `(${indexA} and function(self) return ${indexA}(self) end or function() return ${indexB} end)(self)`;
		}

		const symbol = expression.getType().getSymbol();
		if (symbol) {
			const valDec = symbol.getValueDeclaration();
			if (valDec) {
				if (
					ts.TypeGuards.isFunctionDeclaration(valDec) ||
					ts.TypeGuards.isArrowFunction(valDec) ||
					ts.TypeGuards.isFunctionExpression(valDec) ||
					ts.TypeGuards.isMethodDeclaration(valDec)
				) {
					throw new TranspilerError("Cannot index a function value!", node);
				} else if (ts.TypeGuards.isEnumDeclaration(valDec)) {
					if (valDec.isConstEnum()) {
						const value = valDec.getMemberOrThrow(propertyStr).getValue();
						if (typeof value === "number") {
							return `${value}`;
						} else if (typeof value === "string") {
							return `"${value}"`;
						}
					}
				} else if (ts.TypeGuards.isClassDeclaration(valDec)) {
					if (propertyStr === "prototype") {
						throw new TranspilerError("Class prototypes are not supported!", node);
					}
				}
			}
		}

		if (expressionType.isString() || expressionType.isStringLiteral() || expressionType.isArray()) {
			if (propertyStr === "length") {
				return `#${expStr}`;
			}
		}

		return `${expStr}.${propertyStr}`;
	}

	private transpileParenthesizedExpression(node: ts.ParenthesizedExpression) {
		const expStr = this.transpileExpression(node.getExpression());
		return `(${expStr})`;
	}

	private transpileTemplateExpression(node: ts.TemplateExpression) {
		const bin = new Array<string>();

		const headText = node
			.getHead()
			.getText()
			.replace(/\\"/g, '"')
			.replace(/"/g, '\\"')
			.slice(1, -2);

		if (headText.length > 0) {
			bin.push(`"${headText}"`);
		}

		for (const span of node.getLastChildIfKindOrThrow(ts.SyntaxKind.SyntaxList).getChildren()) {
			if (ts.TypeGuards.isTemplateSpan(span)) {
				const expStr = this.transpileExpression(span.getExpression());
				const trim = span.getNextSibling() ? -2 : -1;
				const literal = span
					.getLiteral()
					.getText()
					.replace(/\\"/g, '"')
					.replace(/"/g, '\\"')
					.slice(1, trim);
				bin.push(`tostring(${expStr})`);
				if (literal.length > 0) {
					bin.push(`"${literal}"`);
				}
			}
		}

		return bin.join(" .. ");
	}

	private transpileElementAccessExpression(node: ts.ElementAccessExpression) {
		const expNode = node.getExpression();
		const expType = expNode.getType();
		const expStr = this.transpileExpression(expNode);

		let offset = "";
		if (
			expType.isTuple() ||
			expType.isArray() ||
			(ts.TypeGuards.isCallExpression(expNode) &&
				(expNode.getReturnType().isArray() || expNode.getReturnType().isTuple()))
		) {
			offset = " + 1";
		}

		const argExpStr = this.transpileExpression(node.getArgumentExpressionOrThrow()) + offset;
		if (ts.TypeGuards.isCallExpression(expNode) && expNode.getReturnType().isTuple()) {
			return `(select(${argExpStr}, ${expStr}))`;
		} else {
			let isArrayLiteral = false;
			if (ts.TypeGuards.isArrayLiteralExpression(expNode)) {
				isArrayLiteral = true;
			} else if (ts.TypeGuards.isNewExpression(expNode)) {
				const subExpNode = expNode.getExpression();
				const subExpType = subExpNode.getType();
				if (subExpType.isObject() && inheritsFrom(subExpType, "ArrayConstructor")) {
					isArrayLiteral = true;
				}
			}
			if (isArrayLiteral) {
				return `(${expStr})[${argExpStr}]`;
			} else {
				return `${expStr}[${argExpStr}]`;
			}
		}
	}

	private transpileAwaitExpression(node: ts.AwaitExpression) {
		const expStr = this.transpileExpression(node.getExpression());
		return `TS.await(${expStr})`;
	}

	private transpileConditionalExpression(node: ts.ConditionalExpression) {
		const conditionStr = this.transpileExpression(node.getCondition());
		const trueStr = this.transpileExpression(node.getWhenTrue());
		const falseStr = this.transpileExpression(node.getWhenFalse());
		return `(${conditionStr} and function() return ${trueStr} end or function() return ${falseStr} end)()`;
	}

	private transpileTypeOfExpression(node: ts.TypeOfExpression) {
		const expStr = this.transpileExpression(node.getExpression());
		return `TS.typeof(${expStr})`;
	}

	private transpileSuperExpression(node: ts.SuperExpression) {
		return `super`;
	}

	private transpileSpreadElement(node: ts.SpreadElement) {
		const expStr = this.transpileExpression(node.getExpression());
		return `unpack(${expStr})`;
	}

	public transpileSourceFile(node: ts.SourceFile, noHeader = false) {
		let result = "";
		result += this.transpileStatementedNode(node);
		if (this.isModule) {
			if (node.getDescendantsOfKind(ts.SyntaxKind.ExportAssignment).length > 0) {
				result = this.indent + `local _exports;\n` + result;
			} else {
				result = this.indent + `local _exports = {};\n` + result;
			}
			result += this.indent + "return _exports;\n";
		} else {
			result += this.indent + "return nil;\n";
		}
		let runtimeLibImport = `local TS = require(game:GetService("ReplicatedStorage").RobloxTS.Include.RuntimeLib);\n`;
		if (noHeader) {
			runtimeLibImport = "-- " + runtimeLibImport;
		}
		result = this.indent + runtimeLibImport + result;
		result = this.indent + "-- luacheck: ignore\n" + result;
		return result;
	}
}
