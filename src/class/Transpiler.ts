import * as path from "path";
import * as ts from "ts-simple-ast";
import { Compiler } from "./Compiler";

export class TranspilerError extends Error {
	constructor(message: string, public node: ts.Node) {
		super(message);
	}
}

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
	"number",
	"string",
	"table",
	"function",

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

function isRbxClassType(type: ts.Type) {
	const symbol = type.getSymbol();
	return symbol !== undefined && RBX_CLASSES.indexOf(symbol.getName()) !== -1;
}

function getLuaPlusOperator(node: ts.BinaryExpression) {
	const leftType = node.getLeft().getType();
	const rightType = node.getRight().getType();
	if (leftType.isString() || rightType.isString() || leftType.isStringLiteral() || rightType.isStringLiteral()) {
		return "..";
	}
	return "+";
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

function getReturnedTypedAncestor(node: ts.Node) {
	let parent: ts.Node | undefined = node;
	while (parent !== undefined) {
		if (ts.TypeGuards.isReturnTypedNode(parent)) {
			return parent;
		}
		parent = parent.getParent();
	}
}

function isBindingPattern(node: ts.Node) {
	return (
		node.getKind() === ts.SyntaxKind.ArrayBindingPattern || node.getKind() === ts.SyntaxKind.ObjectBindingPattern
	);
}

function classGetMethod(classDec: ts.ClassDeclaration, methodName: string): ts.MethodDeclaration | undefined {
	const method = classDec.getMethod(methodName);
	if (method) {
		return method;
	}
	const baseClass = classDec.getBaseClass();
	if (baseClass) {
		const baseMethod = classGetMethod(baseClass, methodName);
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
	private hasModuleExports = false;
	private isIndexModule = false;
	private indent = "";

	private sourceFile?: ts.SourceFile;

	constructor(private compiler: Compiler) {}

	private getNewId() {
		const sum = this.idStack.reduce((accum, value) => accum + value);
		this.idStack[this.idStack.length - 1]++;
		return `_${sum}`;
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
			this.hasModuleExports = true;
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
				const key = strKeys ? `"${child.getText()}"` : childIndex;

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

	private getParameterData(paramNames: Array<string>, initializers: Array<string>, node: HasParameters) {
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
				throw new TranspilerError(`Unexpected parameter type! (${child.getKindName()})`, param);
			}

			if (param.isRestParameter()) {
				paramNames.push("...");
				initializers.push(`local ${name} = { ... };`);
			} else {
				paramNames.push(name);
			}

			const initial = param.getInitializer();
			if (initial) {
				const value = this.transpileExpression(initial, true);
				initializers.push(`if ${name} == nil then ${name} = ${value} end;`);
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
				initializers.push(`local ${names.join(", ")} = ${values.join(", ")};`);
				postStatements.forEach(statement => initializers.push(statement));
			}
		}
	}

	private getSourceFileOrThrow() {
		if (this.sourceFile) {
			return this.sourceFile;
		} else {
			throw new Error("Could not find sourceFile!");
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
			result = this.indent + `local ${hoists.join(", ")};\n` + result;
		}
		const scopeExports = this.exportStack.pop();
		if (scopeExports && scopeExports.length > 0) {
			scopeExports.forEach(scopeExport => (result += this.indent + scopeExport));
		}
		this.popIdStack();
		return result;
	}

	public transpileSourceFile(node: ts.SourceFile) {
		this.sourceFile = node;
		this.isIndexModule =
			this.compiler.options.module === ts.ModuleKind.CommonJS &&
			this.sourceFile.getBaseNameWithoutExtension() === "index";

		let result = "";
		result += this.transpileStatementedNode(node);
		if (this.hasModuleExports) {
			result = this.indent + `local _exports = {};\n` + result;
			result += this.indent + "return _exports;\n";
		}
		result =
			this.indent +
			"local TS = require(game.ReplicatedStorage.RobloxTS.RuntimeLib);\n" +
			this.indent +
			"local Promise = TS.Promise;\n" +
			result;
		return result;
	}

	public transpileBlock(node: ts.Block) {
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

	public transpileArguments(args: Array<ts.Expression>, context?: ts.Expression) {
		const result = new Array<string>();
		if (context) {
			result.push(this.transpileExpression(context));
		}
		args.forEach(arg => result.push(this.transpileExpression(arg)));
		return result.join(", ");
	}

	public transpileIdentifier(identifier: ts.Identifier) {
		if (identifier.getType().isUndefined()) {
			return "nil";
		}
		return identifier.getText();
	}

	public transpileStatement(node: ts.Statement): string {
		if (ts.TypeGuards.isBlock(node)) {
			if (node.getStatements().length === 0) {
				return "";
			}
			return this.transpileBlock(node);
		} else if (ts.TypeGuards.isImportDeclaration(node)) {
			return this.transpileImportDeclaration(node);
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
		} else if (
			ts.TypeGuards.isEmptyStatement(node) ||
			ts.TypeGuards.isTypeAliasDeclaration(node) ||
			ts.TypeGuards.isInterfaceDeclaration(node)
		) {
			return "";
		} else if (ts.TypeGuards.isLabeledStatement(node)) {
			throw new TranspilerError("Labeled statements are not supported!", node);
		} else {
			throw new TranspilerError(`Bad statement! (${node.getKindName()})`, node);
		}
	}

	public transpileImportDeclaration(node: ts.ImportDeclaration) {
		const sourceFile = node.getModuleSpecifierSourceFile();
		let luaPath: string;
		if (sourceFile) {
			if (this.compiler.moduleDir && this.compiler.moduleDir.isAncestorOf(sourceFile)) {
				let importPath = sourceFile.getFilePath().split("/");
				const index = importPath.lastIndexOf("node_modules") + 1;
				const moduleName = importPath[index];
				importPath = importPath.slice(index + 1);
				let last = importPath.pop();
				if (!last) {
					throw new TranspilerError("Malformed import path!", node);
				}
				const ext = path.extname(last);
				if (ext.length > 0) {
					last = path.basename(last, ext);
					const subext = path.extname(last);
					if (subext.length > 0) {
						last = path.basename(last, subext);
					}
				}

				luaPath =
					`TS.getModule("${moduleName}", script.Parent)` +
					importPath.map(v => (v.indexOf("-") !== -1 ? `["${v}"]` : "." + v)).join("");
			} else {
				const relativePath = this.getSourceFileOrThrow().getRelativePathAsModuleSpecifierTo(sourceFile);
				const importPath = relativePath
					.split("/")
					.filter(v => v !== ".")
					.map(v => (v === ".." ? "Parent" : v));
				if (!this.isIndexModule) {
					importPath.unshift("Parent");
				}
				luaPath = "script" + importPath.map(v => (v.indexOf("-") !== -1 ? `["${v}"]` : "." + v)).join("");
			}
		} else {
			const value = node.getModuleSpecifierValue();
			if (value.startsWith("game.") || !isNaN(Number(value))) {
				luaPath = value;
			} else {
				throw new TranspilerError("Invalid import: " + value, node);
			}
		}

		const namespaceImport = node.getNamespaceImport();
		const container = namespaceImport ? namespaceImport.getText() : this.getNewId();
		const importNames = node.getNamedImports();
		const variables = importNames.map(v => {
			const alias = v.getAliasNode();
			return alias ? alias.getText() : v.getName();
		});
		const accessors = importNames.map(v => `${container}.${v.getName()}`);
		const defaultImport = node.getDefaultImport();
		if (defaultImport) {
			variables.unshift(defaultImport.getText());
			accessors.unshift(`${container}._default`);
		}
		let result = "";
		result += this.indent + `local ${container} = require(${luaPath});\n`;
		if (variables.length > 0) {
			result += this.indent + `local ${variables.join(", ")} = ${accessors.join(", ")};\n`;
		}
		return result;
	}

	public transpileDoStatement(node: ts.DoStatement) {
		const condition = this.transpileExpression(node.getExpression());
		let result = "";
		result += this.indent + "repeat\n";
		this.pushIndent();
		result += this.transpileLoopBody(node.getStatement());
		this.popIndent();
		result += this.indent + `until not (${condition});\n`;
		return result;
	}

	public transpileIfStatement(node: ts.IfStatement) {
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

	public transpileBreakStatement(node: ts.BreakStatement) {
		if (node.getLabel()) {
			throw new TranspilerError("Break labels are not supported!", node);
		}
		return this.indent + "break;\n";
	}

	public transpileExpressionStatement(node: ts.ExpressionStatement) {
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
					expression.getOperatorToken().getKind() === ts.SyntaxKind.SlashEqualsToken)
			)
		) {
			throw new TranspilerError(
				"Expression statements must be variable assignments or function calls.",
				expression,
			);
		}
		return this.indent + this.transpileExpression(expression) + ";\n";
	}

	public transpileLoopBody(node: ts.Statement) {
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

	public transpileContinueStatement(node: ts.ContinueStatement) {
		if (node.getLabel()) {
			throw new TranspilerError("Continue labels are not supported!", node);
		}
		return this.indent + `_continue_${this.continueId} = true; break;\n`;
	}

	public transpileForInStatement(node: ts.ForInStatement) {
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
			throw new TranspilerError(
				`ForIn Loop did not expect expression initializer! (${init.getKindName()})`,
				init,
			);
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

	public transpileForOfStatement(node: ts.ForOfStatement) {
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
					initializers.push(`local ${names.join(", ")} = ${values.join(", ")};\n`);
					postStatements.forEach(statement => initializers.push(statement));
				} else if (ts.TypeGuards.isIdentifier(lhs)) {
					varName = lhs.getText();
				}
			}
		} else if (ts.TypeGuards.isExpression(initializer)) {
			throw new TranspilerError(
				`ForOf Loop did not expect expression initializer! (${initializer.getKindName()})`,
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

	public transpileForStatement(node: ts.ForStatement) {
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
				result += this.indent + this.transpileExpression(initializer) + ";\n";
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

	public transpileReturnStatement(node: ts.ReturnStatement) {
		const exp = node.getExpression();
		const dec = getReturnedTypedAncestor(node);
		if (dec && exp && dec.getReturnType().isTuple()) {
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

	public transpileThrowStatement(node: ts.ThrowStatement) {
		const expStr = this.transpileExpression(node.getExpressionOrThrow());
		return this.indent + `error(${expStr});\n`;
	}

	public transpileVariableDeclarationList(node: ts.VariableDeclarationList) {
		if (node.getDeclarationKind() === ts.VariableDeclarationKind.Var) {
			throw new TranspilerError("'var' keyword is not supported! Use 'let' or 'const' instead.", node);
		}
		const names = new Array<string>();
		const values = new Array<string>();
		const preStatements = new Array<string>();
		const postStatements = new Array<string>();

		for (const declaration of node.getDeclarations()) {
			const lhs = declaration.getChildAtIndex(0);
			const equalsToken = declaration.getFirstChildByKind(ts.SyntaxKind.EqualsToken);

			let rhs: ts.Node | undefined;
			if (equalsToken) {
				rhs = equalsToken.getNextSibling();
			}

			if (lhs.getKind() === ts.SyntaxKind.Identifier) {
				names.push(lhs.getText());
				if (rhs) {
					values.push(this.transpileExpression(rhs as ts.Expression));
				} else {
					values.push("nil");
				}
			} else if (isBindingPattern(lhs)) {
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
		while (values[values.length - 1] === "nil") {
			values.pop();
		}

		const parent = node.getParent();
		if (parent && ts.TypeGuards.isVariableStatement(parent)) {
			names.forEach(name => this.pushExport(name, parent));
		}

		let result = "";
		preStatements.forEach(structStatement => (result += this.indent + structStatement + "\n"));
		if (values.length > 0) {
			result += this.indent + `local ${names.join(", ")} = ${values.join(", ")};\n`;
		} else {
			result += this.indent + `local ${names.join(", ")};\n`;
		}
		postStatements.forEach(structStatement => (result += this.indent + structStatement + "\n"));
		return result;
	}

	public transpileVariableStatement(node: ts.VariableStatement) {
		const list = node.getFirstChildByKindOrThrow(ts.SyntaxKind.VariableDeclarationList);
		return this.transpileVariableDeclarationList(list);
	}

	public transpileWhileStatement(node: ts.WhileStatement) {
		const expStr = this.transpileExpression(node.getExpression());
		let result = "";
		result += this.indent + `while ${expStr} do\n`;
		this.pushIndent();
		result += this.transpileLoopBody(node.getStatement());
		this.popIndent();
		result += this.indent + `end;\n`;
		return result;
	}

	public transpileFunctionDeclaration(node: ts.FunctionDeclaration) {
		const name = node.getNameOrThrow();
		const body = node.getBodyOrThrow();
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

	public transpileClassDeclaration(node: ts.ClassDeclaration) {
		if (node.hasDeclareKeyword()) {
			return "";
		}

		const name = node.getName() || this.getNewId();
		this.pushExport(name, node);
		const baseClass = node.getBaseClass();
		const baseClassName = baseClass ? baseClass.getName() : "";

		this.hoistStack[this.hoistStack.length - 1].push(name);

		let result = "";
		result += this.indent + `${name} = (function(super)\n`;
		this.pushIdStack();
		this.pushIndent();

		const id = this.getNewId();

		result += this.indent + `local ${id} = setmetatable({}, super);\n`;
		result += this.indent + `${id}.__index = ${id};\n`;

		const toStrMethod = classGetMethod(node, "toString");
		if (toStrMethod && (toStrMethod.getReturnType().isString() || toStrMethod.getReturnType().isStringLiteral())) {
			result += this.indent + `${id}.__tostring = function(self) return self:toString(); end;\n`;
		}

		for (const prop of node.getStaticProperties()) {
			const propName = prop.getName();
			let propValue = "nil";
			if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
				const initializer = prop.getInitializer();
				if (initializer) {
					propValue = this.transpileExpression(initializer);
				}
			}
			result += this.indent + `${id}.${propName} = ${propValue};\n`;
		}

		const extraInitializers = new Array<string>();
		const instanceProps = node
			.getInstanceProperties()
			.filter(prop => prop.getParent() === node)
			.filter(prop => !ts.TypeGuards.isGetAccessorDeclaration(prop))
			.filter(prop => !ts.TypeGuards.isSetAccessorDeclaration(prop));
		for (const prop of instanceProps) {
			const propName = prop.getName();
			if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
				const initializer = prop.getInitializer();
				if (initializer) {
					const propValue = this.transpileExpression(initializer);
					extraInitializers.push(`self.${propName} = ${propValue};\n`);
				}
			}
		}

		result += this.indent + `${id}.new = function(...)\n`;
		this.pushIndent();
		result += this.indent + `local self = setmetatable({}, ${id});\n`;
		result += this.indent + `self:constructor(...);\n`;
		result += this.indent + `return self;\n`;
		this.popIndent();
		result += this.indent + `end;\n`;

		result += this.transpileConstructorDeclaration(id, getConstructor(node), extraInitializers);

		node.getMethods()
			.filter(method => method.getBody() !== undefined)
			.forEach(method => (result += this.transpileMethodDeclaration(id, method)));

		node.getInstanceProperties().forEach(prop => {
			const propName = prop.getName();
			if (ts.TypeGuards.isGetAccessorDeclaration(prop)) {
				result += this.transpileAccessorDeclaration(prop, id, `_get_${propName}`);
			} else if (ts.TypeGuards.isSetAccessorDeclaration(prop)) {
				result += this.transpileAccessorDeclaration(prop, id, `_set_${propName}`);
			}
		});

		result += this.indent + `return ${id};\n`;
		this.popIndent();
		this.popIdStack();
		result += this.indent + `end)(${baseClassName});\n`;

		return result;
	}

	public transpileConstructorDeclaration(
		className: string,
		node?: ts.ConstructorDeclaration,
		extraInitializers?: Array<string>,
	) {
		const paramNames = new Array<string>();
		paramNames.push("self");
		const initializers = new Array<string>();
		this.pushIdStack();
		if (node) {
			this.getParameterData(paramNames, initializers, node);
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
				if (extraInitializers) {
					extraInitializers.forEach(initializer => (result += this.indent + initializer));
				}
				initializers.forEach(initializer => (result += this.indent + initializer + "\n"));
				result += this.transpileBlock(body);
			}
		} else {
			result += this.indent + `if super then super.constructor(self, ...) end;\n`;
			if (extraInitializers) {
				extraInitializers.forEach(initializer => (result += this.indent + initializer));
			}
		}
		this.popIndent();
		this.popIdStack();
		result += this.indent + "end;\n";
		return result;
	}

	public transpileAccessorDeclaration(
		node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
		className: string,
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
		result += this.indent + `${className}.${name} = function(${paramStr})\n`;
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

	public transpileMethodDeclaration(className: string, node: ts.MethodDeclaration) {
		const name = node.getName();
		const body = node.getBodyOrThrow();

		const paramNames = new Array<string>();
		paramNames.push("self");
		const initializers = new Array<string>();
		this.pushIdStack();
		this.getParameterData(paramNames, initializers, node);
		const paramStr = paramNames.join(", ");

		let result = "";
		if (node.isAsync()) {
			result += this.indent + `${className}.${name} = TS.async(function(${paramStr})\n`;
		} else {
			result += this.indent + `${className}.${name} = function(${paramStr})\n`;
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

	public transpileNamespaceDeclaration(node: ts.NamespaceDeclaration) {
		if (node.hasDeclareKeyword()) {
			return "";
		}

		const name = node.getName();
		let result = "";
		result += `local ${name} = {} do\n`;
		this.pushIndent();
		result += this.transpileStatementedNode(node);
		this.popIndent();
		result += `end;\n`;
		return result;
	}

	public transpileExpression(node: ts.Expression, compress = false): string {
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
		} else if (ts.TypeGuards.isThisExpression(node)) {
			if (!node.getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration)) {
				throw new TranspilerError("'this' may only be used inside a class definition", node);
			}
			return "self";
		} else if (ts.TypeGuards.isSuperExpression(node)) {
			const className = node
				.getType()
				.getSymbolOrThrow()
				.getName();
			return `${className}`;
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

	public transpileStringLiteral(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral) {
		const text = node.getText().slice(1, -1);
		return `"${text}"`;
	}

	public transpileNumericLiteral(node: ts.NumericLiteral) {
		return node.getLiteralValue().toString();
	}

	public transpileBooleanLiteral(node: ts.BooleanLiteral) {
		return node.getLiteralValue() === true ? "true" : "false";
	}

	public transpileArrayLiteralExpression(node: ts.ArrayLiteralExpression) {
		const params = node
			.getElements()
			.map(element => this.transpileExpression(element))
			.join(", ");
		return `{ ${params} }`;
	}

	public transpileObjectLiteralExpression(node: ts.ObjectLiteralExpression, compress: boolean) {
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
					const rhs = this.transpileExpression(property.getInitializerOrThrow(), compress);
					fields.push(`${lhs} = ${rhs}`);
				}
			});
			result += `{ ${fields.join(", ")} }`;
		} else {
			result += `{\n`;
			this.pushIndent();
			properties.forEach(property => {
				if (ts.TypeGuards.isPropertyAssignment(property)) {
					const lhs = property.getName();
					const rhs = this.transpileExpression(property.getInitializerOrThrow(), compress);
					result += this.indent + `${lhs} = ${rhs},\n`;
				}
			});
			this.popIndent();
			result += this.indent + "}";
		}
		return result;
	}

	public transpileFunctionExpression(node: ts.FunctionExpression | ts.ArrowFunction) {
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
			result += ` ${initializers.join(" ")} end`;
		} else {
			throw new TranspilerError(`Bad function body (${body.getKindName()})`, node);
		}
		if (node.isAsync()) {
			result = `TS.async(${result})`;
		}
		this.popIdStack();
		return result;
	}

	public transpileCallExpression(node: ts.CallExpression) {
		const expStr = node.getExpression();
		if (ts.TypeGuards.isPropertyAccessExpression(expStr)) {
			return this.transpilePropertyCallExpression(node);
		} else if (ts.TypeGuards.isSuperExpression(expStr)) {
			let params = this.transpileArguments(node.getArguments() as Array<ts.Expression>);
			if (params.length > 0) {
				params = ", " + params;
			}
			params = "self" + params;
			const className = expStr
				.getType()
				.getSymbolOrThrow()
				.getName();
			return `${className}.constructor(${params})`;
		} else {
			const callPath = this.transpileExpression(expStr);
			const params = this.transpileArguments(node.getArguments() as Array<ts.Expression>);
			return `${callPath}(${params})`;
		}
	}

	public transpilePropertyCallExpression(node: ts.CallExpression) {
		const expression = node.getExpression();
		if (!ts.TypeGuards.isPropertyAccessExpression(expression)) {
			throw new TranspilerError("Expected PropertyAccessExpression", node);
		}
		const subExp = expression.getExpression();
		const subExpType = subExp.getType();
		const accessPath = this.transpileExpression(subExp);
		const property = expression.getName();
		const params = this.transpileArguments(node.getArguments() as Array<ts.Expression>);

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

			// custom math
			const MATH_CLASSES = ["CFrame", "UDim", "UDim2", "Vector2", "Vector2int16", "Vector3", "Vector3int16"];
			if (MATH_CLASSES.some(className => subExpTypeName === className)) {
				switch (property) {
					case "add":
						return `(${accessPath} + ${params})`;
					case "sub":
						return `(${accessPath} - ${params})`;
					case "mul":
						return `(${accessPath} * ${params})`;
					case "div":
						return `(${accessPath} / ${params})`;
				}
			}
		}

		if (ts.TypeGuards.isSuperExpression(subExp)) {
			let paramStr = "";
			if (params.length > 0) {
				paramStr = `, ${params}`;
			}
			return `${accessPath}.${property}(self${paramStr})`;
		}

		const symbol = expression.getType().getSymbol();

		let sep = ".";
		if (
			symbol &&
			symbol
				.getDeclarations()
				.some(dec => ts.TypeGuards.isMethodDeclaration(dec) || ts.TypeGuards.isMethodSignature(dec))
		) {
			sep = ":";
		}

		return `${accessPath}${sep}${property}(${params})`;
	}

	public transpileBinaryExpression(node: ts.BinaryExpression) {
		const opToken = node.getOperatorToken();
		const opKind = opToken.getKind();

		const lhs = node.getLeft();
		const rhs = node.getRight();
		let lhsStr: string;
		const rhsStr = this.transpileExpression(rhs);
		const statements = new Array<string>();

		let isSetter = false;
		let setterName = "";
		let setterExp = "";
		if (ts.TypeGuards.isPropertyAccessExpression(lhs)) {
			const lhsExp = lhs.getExpression();
			const symbol = lhsExp.getType().getSymbol();
			if (symbol) {
				const valDec = symbol.getValueDeclaration();
				if (valDec && ts.TypeGuards.isClassDeclaration(valDec)) {
					setterName = lhs.getName();
					setterExp = this.transpileExpression(lhsExp);
					if (valDec.getSetAccessor(setterName)) {
						isSetter = true;
					}
				}
			}
		}

		function getOperandStr() {
			if (!isSetter) {
				switch (opKind) {
					case ts.SyntaxKind.EqualsToken:
						return `${lhsStr} = ${rhsStr}`;
					case ts.SyntaxKind.PlusEqualsToken:
						return `${lhsStr} = ${lhsStr} ${getLuaPlusOperator(node)} (${rhsStr})`;
					case ts.SyntaxKind.MinusEqualsToken:
						return `${lhsStr} = ${lhsStr} - (${rhsStr})`;
					case ts.SyntaxKind.AsteriskEqualsToken:
						return `${lhsStr} = ${lhsStr} * (${rhsStr})`;
					case ts.SyntaxKind.SlashEqualsToken:
						return `${lhsStr} = ${lhsStr} / (${rhsStr})`;
					case ts.SyntaxKind.AsteriskAsteriskEqualsToken:
						return `${lhsStr} = ${lhsStr} ^ (${rhsStr})`;
				}
			} else {
				switch (opKind) {
					case ts.SyntaxKind.EqualsToken:
						return `${setterExp}:_set_${setterName}(${rhsStr})`;
					case ts.SyntaxKind.PlusEqualsToken:
						return `${setterExp}:_set_${setterName}(${lhsStr} ${getLuaPlusOperator(node)} ${rhsStr})`;
					case ts.SyntaxKind.MinusEqualsToken:
						return `${setterExp}:_set_${setterName}(${lhsStr} - ${rhsStr})`;
					case ts.SyntaxKind.AsteriskEqualsToken:
						return `${setterExp}:_set_${setterName}(${lhsStr} * ${rhsStr})`;
					case ts.SyntaxKind.SlashEqualsToken:
						return `${setterExp}:_set_${setterName}(${lhsStr} / ${rhsStr})`;
					case ts.SyntaxKind.AsteriskAsteriskEqualsToken:
						return `${setterExp}:_set_${setterName}(${lhsStr} ^ ${rhsStr})`;
				}
			}
			throw new TranspilerError("Unrecognized operation!", node);
		}

		if (
			opKind === ts.SyntaxKind.EqualsToken ||
			opKind === ts.SyntaxKind.PlusEqualsToken ||
			opKind === ts.SyntaxKind.MinusEqualsToken ||
			opKind === ts.SyntaxKind.AsteriskEqualsToken ||
			opKind === ts.SyntaxKind.SlashEqualsToken ||
			opKind === ts.SyntaxKind.AsteriskAsteriskEqualsToken
		) {
			if (!isSetter && ts.TypeGuards.isElementAccessExpression(lhs) && opKind !== ts.SyntaxKind.EqualsToken) {
				const lhsExpNode = lhs.getExpression();
				const lhsExpType = lhsExpNode.getType();
				const lhsExpStr = this.transpileExpression(lhsExpNode);
				let offset = "";
				if (
					lhsExpType.isTuple() ||
					lhsExpType.isArray() ||
					(ts.TypeGuards.isCallExpression(lhsExpNode) &&
						(lhsExpNode.getReturnType().isArray() || lhsExpNode.getReturnType().isTuple()))
				) {
					offset = " + 1";
				}
				const argExpStr = this.transpileExpression(lhs.getArgumentExpressionOrThrow()) + offset;
				const id = this.getNewId();
				statements.push(`local ${id} = ${argExpStr}`);
				if (ts.TypeGuards.isCallExpression(lhsExpNode) && lhsExpNode.getReturnType().isTuple()) {
					lhsStr = `(select(${id}, ${lhsExpStr}))`;
				} else {
					if (this.isArrayLiteral(lhsExpNode)) {
						lhsStr = `(${lhsExpStr})[${id}]`;
					} else {
						lhsStr = `${lhsExpStr}[${id}]`;
					}
				}
			} else if (
				!isSetter &&
				ts.TypeGuards.isPropertyAccessExpression(lhs) &&
				opKind !== ts.SyntaxKind.EqualsToken
			) {
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
				return `(function() ${statements.join("; ")}; return ${lhsStr}; end)()`;
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
			case ts.SyntaxKind.ExclamationEqualsEqualsToken:
				return `${lhsStr} ~= ${rhsStr}`;
			case ts.SyntaxKind.PlusToken:
				return `${lhsStr} ${getLuaPlusOperator(node)} ${rhsStr}`;
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
			case ts.SyntaxKind.InstanceOfKeyword:
				if (inheritsFrom(node.getRight().getType(), "Rbx_Instance")) {
					return `TS.isA(${lhsStr}, "${rhsStr}")`;
				} else if (isRbxClassType(node.getRight().getType())) {
					return `(TS.typeof(${lhsStr}) == "${rhsStr}")`;
				} else {
					return `TS.instanceof(${lhsStr}, ${rhsStr})`;
				}
			default:
				throw new TranspilerError(`Bad binary expression! (${node.getOperatorToken().getKindName()})`, opToken);
		}
	}

	public transpilePrefixUnaryExpression(node: ts.PrefixUnaryExpression) {
		const parent = node.getParentOrThrow();
		const operand = node.getOperand();

		let expStr: string;
		const statements = new Array<string>();

		let isSetter = false;
		let setterName = "";
		let setterExp = "";
		if (ts.TypeGuards.isPropertyAccessExpression(operand)) {
			const opExp = operand.getExpression();
			const symbol = opExp.getType().getSymbol();
			if (symbol) {
				const valDec = symbol.getValueDeclaration();
				if (valDec && ts.TypeGuards.isClassDeclaration(valDec)) {
					setterName = operand.getName();
					setterExp = this.transpileExpression(opExp);
					if (valDec.getSetAccessor(setterName)) {
						isSetter = true;
					}
				}
			}
		}

		const opKind = node.getOperatorToken();
		this.pushIdStack();
		if (
			(opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) &&
			!isSetter &&
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
			if (!isSetter) {
				switch (opKind) {
					case ts.SyntaxKind.PlusPlusToken:
						return `${expStr} = ${expStr} + 1`;
					case ts.SyntaxKind.MinusMinusToken:
						return `${expStr} = ${expStr} - 1`;
				}
			} else {
				switch (opKind) {
					case ts.SyntaxKind.PlusPlusToken:
						return `${setterExp}:_set_${setterName}(${expStr} + 1)`;
					case ts.SyntaxKind.MinusMinusToken:
						return `${setterExp}:_set_${setterName}(${expStr} - 1)`;
				}
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
				return `(function() ${statements.join("; ")}; return ${expStr}; end)()`;
			}
		}

		switch (node.getOperatorToken()) {
			case ts.SyntaxKind.ExclamationToken:
				return `not ${expStr}`;
			case ts.SyntaxKind.MinusToken:
				return `-${expStr}`;
		}
		throw new TranspilerError(`Bad prefix unary expression! (${node.getOperatorToken()})`, node);
	}

	public transpilePostfixUnaryExpression(node: ts.PostfixUnaryExpression) {
		const parent = node.getParentOrThrow();
		const operand = node.getOperand();

		let expStr: string;
		const statements = new Array<string>();

		let isSetter = false;
		let setterName = "";
		let setterExp = "";
		if (ts.TypeGuards.isPropertyAccessExpression(operand)) {
			const opExp = operand.getExpression();
			const symbol = opExp.getType().getSymbol();
			if (symbol) {
				const valDec = symbol.getValueDeclaration();
				if (valDec && ts.TypeGuards.isClassDeclaration(valDec)) {
					setterName = operand.getName();
					setterExp = this.transpileExpression(opExp);
					if (valDec.getSetAccessor(setterName)) {
						isSetter = true;
					}
				}
			}
		}

		const opKind = node.getOperatorToken();
		this.pushIdStack();
		if (
			(opKind === ts.SyntaxKind.PlusPlusToken || opKind === ts.SyntaxKind.MinusMinusToken) &&
			!isSetter &&
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
			if (!isSetter) {
				switch (opKind) {
					case ts.SyntaxKind.PlusPlusToken:
						return `${expStr} = ${expStr} + 1`;
					case ts.SyntaxKind.MinusMinusToken:
						return `${expStr} = ${expStr} - 1`;
				}
			} else {
				switch (opKind) {
					case ts.SyntaxKind.PlusPlusToken:
						return `${setterExp}:_set_${setterName}(${expStr} + 1)`;
					case ts.SyntaxKind.MinusMinusToken:
						return `${setterExp}:_set_${setterName}(${expStr} - 1)`;
				}
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
				return `(function() ${statements.join("; ")}; return ${id}; end)()`;
			}
		}
		throw new TranspilerError(`Bad postfix unary expression! (${node.getOperatorToken()})`, node);
	}

	public transpileNewExpression(node: ts.NewExpression) {
		if (!node.getFirstChildByKind(ts.SyntaxKind.OpenParenToken)) {
			throw new TranspilerError("Parentheses-less new expressions not allowed!", node);
		}

		const expStr = node.getExpression();
		const expressionType = expStr.getType();
		const name = this.transpileExpression(expStr);
		const params = this.transpileArguments(node.getArguments() as Array<ts.Expression>);

		if (expressionType.isObject()) {
			if (inheritsFrom(expressionType, "Rbx_Instance")) {
				const paramStr = params.length > 0 ? `, ${params}` : "";
				return `Instance.new("${name}"${paramStr})`;
			}

			if (inheritsFrom(expressionType, "ArrayConstructor")) {
				return "{}";
			}
		}

		return `${name}.new(${params})`;
	}

	public transpilePropertyAccessExpression(node: ts.PropertyAccessExpression) {
		const expression = node.getExpression();
		const expressionType = expression.getType();
		const expStr = this.transpileExpression(expression);
		const propertyStr = node.getName();

		const symbol = expression.getType().getSymbol();
		if (symbol) {
			const valDec = symbol.getValueDeclaration();
			if (valDec && ts.TypeGuards.isClassDeclaration(valDec)) {
				if (valDec.getGetAccessor(propertyStr)) {
					return `${expStr}:_get_${propertyStr}()`;
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

	public transpileParenthesizedExpression(node: ts.ParenthesizedExpression) {
		const expStr = this.transpileExpression(node.getExpression());
		return `(${expStr})`;
	}

	public transpileTemplateExpression(node: ts.TemplateExpression) {
		const bin = new Array<string>();

		const headText = node
			.getHead()
			.getText()
			.replace(/\\"/g, '"')
			.replace(/"/g, '\\"')
			.slice(1, -2);
		if (headText.length > 2) {
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

	private isArrayLiteral(node: ts.Expression) {
		let isArrayLiteral = false;
		if (ts.TypeGuards.isArrayLiteralExpression(node)) {
			isArrayLiteral = true;
		} else if (ts.TypeGuards.isNewExpression(node)) {
			const subExpNode = node.getExpression();
			const subExpType = subExpNode.getType();
			if (subExpType.isObject() && inheritsFrom(subExpType, "ArrayConstructor")) {
				isArrayLiteral = true;
			}
		}
		return isArrayLiteral;
	}

	public transpileElementAccessExpression(node: ts.ElementAccessExpression) {
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
			if (this.isArrayLiteral(expNode)) {
				return `(${expStr})[${argExpStr}]`;
			} else {
				return `${expStr}[${argExpStr}]`;
			}
		}
	}

	public transpileAwaitExpression(node: ts.AwaitExpression) {
		const expStr = this.transpileExpression(node.getExpression());
		return `TS.await(${expStr})`;
	}

	public transpileConditionalExpression(node: ts.ConditionalExpression) {
		const conditionStr = this.transpileExpression(node.getCondition());
		const trueStr = this.transpileExpression(node.getWhenTrue());
		const falseStr = this.transpileExpression(node.getWhenFalse());
		return `(${conditionStr} and function() return ${trueStr} end or function() return ${falseStr} end)()`;
	}

	public transpileTypeOfExpression(node: ts.TypeOfExpression) {
		const expStr = this.transpileExpression(node.getExpression());
		return `TS.typeof(${expStr})`;
	}
}
