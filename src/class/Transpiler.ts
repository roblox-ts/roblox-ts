import * as ts from "ts-simple-ast";
import { getScriptContext, getScriptType, safeLuaIndex, ScriptContext, ScriptType, suggest } from "../utility";
import { Compiler } from "./Compiler";
import { TranspilerError, TranspilerErrorType } from "./errors/TranspilerError";

type HasParameters =
	| ts.FunctionExpression
	| ts.ArrowFunction
	| ts.FunctionDeclaration
	| ts.ConstructorDeclaration
	| ts.MethodDeclaration
	| ts.GetAccessorDeclaration
	| ts.SetAccessorDeclaration;

// used for the typeof operator
const RBX_DATA_CLASSES = [
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

const ROACT_ELEMENT_TYPE = "Roact.Element";
const ROACT_COMPONENT_TYPE = "Roact.Component";
const ROACT_PURE_COMPONENT_TYPE = "Roact.PureComponent";
const ROACT_COMPONENT_CLASSES = [ROACT_COMPONENT_TYPE, ROACT_PURE_COMPONENT_TYPE];

/**
 * A list of lowercase names that map to Roblox elements for JSX
 */
const INTRINSIC_MAPPINGS: { [name: string]: string } = {
	billboardgui: "BillboardGui",

	frame: "Frame",

	imagebutton: "ImageButton",
	imagelabel: "ImageLabel",

	screengui: "ScreenGui",
	scrollingframe: "ScrollingFrame",
	surfacegui: "SurfaceGui",

	textbox: "TextBox",
	textbutton: "TextButton",
	textlabel: "TextLabel",

	uigridlayout: "UIGridLayout",
	uilistlayout: "UIListLayout",
	uipagelayout: "UIPageLayout",
	uitablelayout: "UITableLayout",

	uipadding: "UIPadding",
	uiscale: "UIScale",

	uiaspectratioconstraint: "UIAspectRatioConstraint",

	uisizeconstraint: "UISizeConstraint",
	uitextsizeconstraint: "UITextSizeConstraint",

	viewportframe: "ViewportFrame",
};

function isRbxDataClassType(type: ts.Type) {
	const symbol = type.getSymbol();
	return symbol !== undefined && RBX_DATA_CLASSES.indexOf(symbol.getName()) !== -1;
}

function getLuaBarExpression(node: ts.BinaryExpression, lhsStr: string, rhsStr: string) {
	let rhs = node.getRight();
	if (ts.TypeGuards.isParenthesizedExpression(rhs)) {
		rhs = rhs.getExpression();
	}
	if (ts.TypeGuards.isNumericLiteral(rhs) && rhs.getLiteralValue() === 0) {
		return `TS.round(${lhsStr})`;
	} else {
		return `TS.bor(${lhsStr}, ${rhsStr})`;
	}
}

function getLuaBitExpression(node: ts.BinaryExpression, lhsStr: string, rhsStr: string, name: string) {
	return `TS.b${name}(${lhsStr}, ${rhsStr})`;
}

function getLuaAddExpression(node: ts.BinaryExpression, lhsStr: string, rhsStr: string, wrap = false) {
	if (wrap) {
		rhsStr = `(${rhsStr})`;
	}
	const leftType = node.getLeft().getType();
	const rightType = node.getRight().getType();
	if (leftType.isString() || rightType.isString() || leftType.isStringLiteral() || rightType.isStringLiteral()) {
		return `(${lhsStr}) .. ${rhsStr}`;
	} else if (
		(leftType.isNumber() || leftType.isNumberLiteral()) &&
		(rightType.isNumber() || rightType.isNumberLiteral())
	) {
		return `${lhsStr} + ${rhsStr}`;
	} else {
		return `TS.add(${lhsStr}, ${rhsStr})`;
	}
}

function getFullTypeList(type: ts.Type): Array<string> {
	const symbol = type.getSymbol();
	const typeArray = new Array<string>();
	if (symbol) {
		symbol.getDeclarations().forEach(declaration => {
			typeArray.push(declaration.getType().getText());
			declaration
				.getType()
				.getBaseTypes()
				.forEach(baseType => typeArray.push(...getFullTypeList(baseType)));
		});
	}

	return typeArray;
}

function isRoactElementType(type: ts.Type) {
	const allowed = [ROACT_ELEMENT_TYPE, `${ROACT_ELEMENT_TYPE}[]`];
	const types = type.getUnionTypes();

	if (types.length > 0) {
		for (const unionType of types) {
			const unionTypeName = unionType.getText();
			if (allowed.indexOf(unionTypeName) === -1 && unionTypeName !== "undefined") {
				return false;
			}
		}
	} else {
		return allowed.indexOf(type.getText()) !== -1;
	}

	return true;
}

function inheritsFromRoact(type: ts.Type): boolean {
	const fullName = getFullTypeList(type);
	let isRoactClass = false;
	for (const name of fullName) {
		if (ROACT_COMPONENT_CLASSES.findIndex(value => name.startsWith(value)) !== -1) {
			isRoactClass = true;
			break;
		}
	}

	return isRoactClass;
}

function inheritsFrom(type: ts.Type, className: string): boolean {
	const symbol = type.getSymbol();
	if (symbol) {
		if (symbol.getName() === className) {
			return true;
		}
		const declarations = symbol.getDeclarations();
		for (const declaration of declarations) {
			if (!ts.TypeGuards.isSourceFile(declaration)) {
				const decType = declaration.getType();
				const decBaseTypes = decType.getBaseTypes();
				for (const baseType of decBaseTypes) {
					if (inheritsFrom(baseType, className)) {
						return true;
					}
				}
			}
		}
	}
	return false;
}

function isRbxInstance(node: ts.Node): boolean {
	return inheritsFrom(node.getType(), "Rbx_Instance");
}

function getConstructor(node: ts.ClassDeclaration | ts.ClassExpression) {
	for (const constructor of node.getConstructors()) {
		return constructor;
	}
}

function isBindingPattern(node: ts.Node) {
	return (
		node.getKind() === ts.SyntaxKind.ArrayBindingPattern || node.getKind() === ts.SyntaxKind.ObjectBindingPattern
	);
}

function getClassMethod(
	classDec: ts.ClassDeclaration | ts.ClassExpression,
	methodName: string,
): ts.MethodDeclaration | undefined {
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

function isType(node: ts.Node) {
	return (
		ts.TypeGuards.isEmptyStatement(node) ||
		ts.TypeGuards.isTypeAliasDeclaration(node) ||
		ts.TypeGuards.isInterfaceDeclaration(node) ||
		(ts.TypeGuards.isAmbientableNode(node) && node.hasDeclareKeyword())
	);
}

function isTupleLike(type: ts.Type) {
	return type.isTuple() || (type.isUnion() && type.getUnionTypes().every(t => t.isTuple()));
}

export class Transpiler {
	// in the form EXPORT_LET_VAR_NAME : NAMESPACE_LOCATION
	private unlocalizedVariables = new Map<string, string>();

	private hoistStack = new Array<Set<string>>();
	private exportStack = new Array<Set<string>>();
	private namespaceStack = new Map<ts.NamespaceDeclaration, string>();
	private idStack = new Array<number>();
	private continueId = -1;
	private isModule = false;
	private indent = "";
	private scriptContext = ScriptContext.None;
	private roactIndent: number = 0;
	private hasRoactImport: boolean = false;

	constructor(private compiler: Compiler) {}

	private getNewId() {
		const sum = this.idStack.reduce((accum, value) => accum + value);
		this.idStack[this.idStack.length - 1]++;
		return `_${sum}`;
	}

	private checkReserved(name: string, node: ts.Node) {
		if (LUA_RESERVED_KEYWORDS.indexOf(name) !== -1) {
			throw new TranspilerError(
				`Cannot use '${name}' as identifier (reserved Lua keyword)`,
				node,
				TranspilerErrorType.ReservedKeyword,
			);
		} else if (!name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
			throw new TranspilerError(
				`Cannot use '${name}' as identifier (doesn't match Lua's identifier rules)`,
				node,
				TranspilerErrorType.InvalidIdentifier,
			);
		} else if (name === "_exports" || name === "undefined" || name.match(/^_[0-9]+$/)) {
			throw new TranspilerError(
				`Cannot use '${name}' as identifier (reserved for Roblox-ts)`,
				node,
				TranspilerErrorType.RobloxTSReservedIdentifier,
			);
		}
	}

	private checkMethodReserved(name: string, node: ts.Node) {
		this.checkReserved(name, node);
		if (LUA_RESERVED_METAMETHODS.indexOf(name) !== -1) {
			throw new TranspilerError(
				`Cannot use '${name}' as a method name (reserved Lua metamethod)`,
				node,
				TranspilerErrorType.ReservedMethodName,
			);
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

	private safeMapGet<T, R>(MapObj: Map<T, R>, Key: T, node: ts.Node) {
		const Find = MapObj.get(Key);
		if (!Find) {
			throw new TranspilerError(
				`Failed to find context for ${node.getKindName()}`,
				node,
				TranspilerErrorType.BadContext,
			);
		}
		return Find;
	}

	private getExportContextName(node: ts.VariableStatement | ts.Node): string {
		const myNamespace = node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);
		let name;

		if (myNamespace) {
			name = this.safeMapGet(this.namespaceStack, myNamespace, node);
		} else {
			name = "_exports";
			this.isModule = true;
		}

		return name;
	}

	private pushExport(name: string, node: ts.Node & ts.ExportableNode) {
		if (!node.hasExportKeyword()) {
			return;
		}

		this.isModule = true;
		const ancestorName = this.getExportContextName(node);
		const alias = node.isDefaultExport() ? "_default" : name;
		this.exportStack[this.exportStack.length - 1].add(`${ancestorName}.${alias} = ${name};\n`);
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
					throw new TranspilerError(
						"Operator ... is not supported for destructuring!",
						child,
						TranspilerErrorType.SpreadDestructuring,
					);
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
				throw new TranspilerError(
					"Child missing from parameter!",
					param,
					TranspilerErrorType.ParameterChildMissing,
				);
			}

			let name: string;
			if (ts.TypeGuards.isIdentifier(child)) {
				name = child.getText();
			} else if (isBindingPattern(child)) {
				name = this.getNewId();
			} else {
				const kindName = child.getKindName();
				throw new TranspilerError(
					`Unexpected parameter type! (${kindName})`,
					param,
					TranspilerErrorType.UnexpectedParameterType,
				);
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
				const defaultValue = `if ${name} == nil then ${name} = ${this.transpileExpression(initial)} end;`;
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

	private popHoistStack(result: string) {
		const hoists = this.hoistStack.pop();
		if (hoists && hoists.size > 0) {
			result = this.indent + `local ${[...hoists].join(", ")};\n` + result;
		}
		return result;
	}

	private transpileStatementedNode(node: ts.Node & ts.StatementedNode) {
		this.pushIdStack();
		this.exportStack.push(new Set<string>());
		let result = "";
		this.hoistStack.push(new Set<string>());
		for (const child of node.getStatements()) {
			result += this.transpileStatement(child);
			if (child.getKind() === ts.SyntaxKind.ReturnStatement) {
				break;
			}
		}

		result = this.popHoistStack(result);

		const scopeExports = this.exportStack.pop();
		if (scopeExports && scopeExports.size > 0) {
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
		return args.map(arg => this.transpileExpression(arg)).join(", ");
	}

	private transpileIdentifier(node: ts.Identifier) {
		let name = node.getText();
		if (name === "undefined") {
			return "nil";
		}
		this.checkReserved(name, node);
		if (RUNTIME_CLASSES.indexOf(name) !== -1) {
			name = `TS.${name}`;
		} else {
			if (isRbxInstance(node)) {
				const parent = node.getParent();
				if (
					!ts.TypeGuards.isNewExpression(parent) &&
					!(
						ts.TypeGuards.isBinaryExpression(parent) &&
						parent.getOperatorToken().getKind() === ts.SyntaxKind.InstanceOfKeyword
					)
				) {
					const nodeSymbol = node.getSymbol();
					const typeSymbol = node.getType().getSymbol();
					if (nodeSymbol && typeSymbol && nodeSymbol === typeSymbol) {
						const valueDec = nodeSymbol.getValueDeclaration();
						if (valueDec && ts.TypeGuards.isClassDeclaration(valueDec)) {
							name = `TS.Instance.${name}`;
						}
					}
				}
			}
		}

		for (const def of node.getDefinitions()) {
			const definition = def.getNode();

			if (def.getSourceFile() === node.getSourceFile()) {
				// I have no idea why, but getDefinitionNodes() cannot replace this
				const declaration = definition.getFirstAncestorByKind(ts.SyntaxKind.VariableStatement);

				if (declaration) {
					if (declaration.hasExportKeyword()) {
						return this.getExportContextName(declaration) + "." + name;
					}
				} else {
					const parent = definition.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);

					if (parent) {
						const grandparent = parent.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);
						if (grandparent) {
							const parentName = this.namespaceStack.get(grandparent);
							if (parentName) {
								return parentName + "." + name;
							}
						}
					}
				}
			} else {
				if (this.isDefinitionALet(def)) {
					const namespace = this.unlocalizedVariables.get(name);
					if (namespace) {
						return namespace;
					}
				}
			}
		}

		return name;
	}

	private transpileStatement(node: ts.Statement): string {
		if (isType(node)) {
			return "";
		} else if (ts.TypeGuards.isBlock(node)) {
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
		} else if (ts.TypeGuards.isTryStatement(node)) {
			return this.transpileTryStatement(node);
		} else if (
			ts.TypeGuards.isEmptyStatement(node) ||
			ts.TypeGuards.isTypeAliasDeclaration(node) ||
			ts.TypeGuards.isInterfaceDeclaration(node)
		) {
			return "";
		} else if (ts.TypeGuards.isLabeledStatement(node)) {
			throw new TranspilerError(
				"Labeled statements are not supported!",
				node,
				TranspilerErrorType.NoLabeledStatement,
			);
		} else {
			const kindName = node.getKindName();
			throw new TranspilerError(`Bad statement! (${kindName})`, node, TranspilerErrorType.BadStatement);
		}
	}

	private isDefinitionALet(def: ts.DefinitionInfo<ts.ts.DefinitionInfo>) {
		const parent = def.getNode().getParent();

		if (parent && ts.TypeGuards.isVariableDeclaration(parent)) {
			const grandparent = parent.getParent();
			return (
				ts.TypeGuards.isVariableDeclarationList(grandparent) &&
				grandparent.getDeclarationKind() === ts.VariableDeclarationKind.Let
			);
		}
		return false;
	}

	private shouldLocalizeImport(namedImport: ts.Identifier) {
		for (const def of namedImport.getDefinitions()) {
			if (this.isDefinitionALet(def)) {
				return false;
			}
		}

		return true;
	}

	private transpileImportDeclaration(node: ts.ImportDeclaration) {
		let luaPath: string;
		if (node.isModuleSpecifierRelative()) {
			luaPath = this.compiler.getRelativeImportPath(
				node.getSourceFile(),
				node.getModuleSpecifierSourceFile(),
				node.getModuleSpecifier().getLiteralText(),
			);
		} else {
			const moduleFile = node.getModuleSpecifierSourceFile();
			if (moduleFile) {
				luaPath = this.compiler.getImportPathFromFile(node.getSourceFile(), moduleFile);
			} else {
				const specifierText = node.getModuleSpecifier().getLiteralText();
				throw new TranspilerError(
					`Could not find file for '${specifierText}'. Did you forget to "npm install"?`,
					node,
					TranspilerErrorType.MissingModuleFile,
				);
			}
		}

		const lhs = new Array<string>();
		const rhs = new Array<string>();

		const defaultImport = node.getDefaultImport();
		if (defaultImport) {
			const definitions = defaultImport.getDefinitions();
			const exportAssignments =
				definitions.length > 0 &&
				definitions[0]
					.getNode()
					.getSourceFile()
					.getExportAssignments();

			const defaultImportExp = this.transpileExpression(defaultImport);

			if (exportAssignments && exportAssignments.length === 1 && exportAssignments[0].isExportEquals()) {
				// If the defaultImport is importing an `export = ` statement,
				return `local ${defaultImportExp} = ${luaPath};\n`;
			}

			lhs.push(defaultImportExp);
			rhs.push(`._default`);
		}

		const namespaceImport = node.getNamespaceImport();
		if (namespaceImport) {
			lhs.push(this.transpileExpression(namespaceImport));
			rhs.push("");
		}

		let result = "";
		let rhsPrefix: string;
		let hasVarNames = false;
		const unlocalizedImports = new Array<string>();

		node.getNamedImports().forEach(namedImport => {
			const aliasNode = namedImport.getAliasNode();
			const name = namedImport.getName();
			const alias = aliasNode ? aliasNode.getText() : name;
			const shouldLocalizeImport = this.shouldLocalizeImport(namedImport.getNameNode());

			// Keep these here no matter what, so that exports can take from intinial state.
			this.checkReserved(alias, node);
			lhs.push(alias);
			rhs.push(`.${name}`);

			if (shouldLocalizeImport) {
				unlocalizedImports.push("");
			} else {
				hasVarNames = true;
				unlocalizedImports.push(alias);
			}
		});

		if (rhs.length === 1 && !hasVarNames) {
			rhsPrefix = luaPath;
		} else {
			if (hasVarNames || lhs.length > 0) {
				rhsPrefix = this.getNewId();
				result += `local ${rhsPrefix} = `;
			}
			result += `${luaPath};\n`;
		}

		unlocalizedImports
			.filter(alias => alias !== "")
			.forEach((alias, i) => this.unlocalizedVariables.set(alias, rhsPrefix + rhs[i]));

		if (hasVarNames || lhs.length > 0) {
			const lhsStr = lhs.join(", ");
			const rhsStr = rhs.map(v => rhsPrefix + v).join(", ");

			if (lhsStr === "Roact") {
				this.hasRoactImport = true;
			}
			result += `local ${lhsStr} = ${rhsStr};\n`;
		}

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
					const exp = moduleReference.getExpressionOrThrow() as ts.StringLiteral;
					specifier = exp.getLiteralText();
				} else {
					throw new TranspilerError("Bad specifier", node, TranspilerErrorType.BadSpecifier);
				}
				luaPath = this.compiler.getRelativeImportPath(node.getSourceFile(), moduleFile, specifier);
			} else {
				luaPath = this.compiler.getImportPathFromFile(node.getSourceFile(), moduleFile);
			}
		} else {
			const text = node.getModuleReference().getText();
			throw new TranspilerError(`Could not find file for '${text}'`, node, TranspilerErrorType.MissingModuleFile);
		}

		const name = node.getName();

		if (name === "Roact") {
			this.hasRoactImport = true;
		}

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
					luaPath = this.compiler.getImportPathFromFile(node.getSourceFile(), moduleFile);
				} else {
					const specifierText = moduleSpecifier.getLiteralText();
					throw new TranspilerError(
						`Could not find file for '${specifierText}'. Did you forget to "npm install"?`,
						node,
						TranspilerErrorType.MissingModuleFile,
					);
				}
			}
		}

		const ancestor =
			node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration) ||
			node.getFirstAncestorByKind(ts.SyntaxKind.SourceFile);

		if (!ancestor) {
			throw new TranspilerError("Could not find export ancestor!", node, TranspilerErrorType.BadAncestor);
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
				throw new TranspilerError(
					"Namespace exports require a module specifier!",
					node,
					TranspilerErrorType.BadSpecifier,
				);
			}
			return this.indent + `TS.exportNamespace(require(${luaPath}), ${ancestorName});\n`;
		} else {
			const namedExports = node.getNamedExports();
			if (namedExports.length === 0) {
				return "";
			}
			namedExports.forEach(namedExport => {
				const aliasNode = namedExport.getAliasNode();
				let name = namedExport.getNameNode().getText();
				if (name === "default") {
					name = "_" + name;
				}
				const alias = aliasNode ? aliasNode.getText() : name;
				this.checkReserved(alias, node);
				lhs.push(alias);
				if (luaPath !== "") {
					rhs.push(`.${name}`);
				} else {
					rhs.push(name);
				}
			});

			let result = "";
			let rhsPrefix: string;
			const lhsPrefix = ancestorName + ".";
			if (rhs.length <= 1) {
				rhsPrefix = luaPath !== "" ? `require(${luaPath})` : "";
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
			throw new TranspilerError("Break labels are not supported!", node, TranspilerErrorType.NoLabeledStatement);
		}
		return this.indent + "break;\n";
	}

	private transpileExpressionStatement(node: ts.ExpressionStatement) {
		// big set of rules for expression statements
		const expression = node.getExpression();

		if (ts.TypeGuards.isCallExpression(expression)) {
			return this.indent + this.transpileCallExpression(expression, true) + ";\n";
		}

		if (
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
				TranspilerErrorType.BadExpressionStatement,
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
			throw new TranspilerError(
				"Continue labels are not supported!",
				node,
				TranspilerErrorType.NoLabeledStatement,
			);
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
					throw new TranspilerError(
						`ForIn Loop did not expect binding pattern!`,
						init,
						TranspilerErrorType.UnexpectedBindingPattern,
					);
				} else if (ts.TypeGuards.isIdentifier(lhs)) {
					varName = lhs.getText();
				}
			}
		} else if (ts.TypeGuards.isExpression(init)) {
			const initKindName = init.getKindName();
			throw new TranspilerError(
				`ForIn Loop did not expect expression initializer! (${initKindName})`,
				init,
				TranspilerErrorType.UnexpectedInitializer,
			);
		}

		if (varName.length === 0) {
			throw new TranspilerError(`ForIn Loop empty varName!`, init, TranspilerErrorType.ForEmptyVarName);
		}

		const exp = node.getExpression();
		const expStr = this.transpileExpression(exp);
		let result = "";
		if (exp.getType().isArray()) {
			result += this.indent + `for ${varName} = 0, #${expStr} - 1 do\n`;
		} else {
			result += this.indent + `for ${varName} in pairs(${expStr}) do\n`;
		}
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
		const init = node.getInitializer();
		let varName = "";
		const initializers = new Array<string>();
		if (ts.TypeGuards.isVariableDeclarationList(init)) {
			for (const declaration of init.getDeclarations()) {
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
		} else if (ts.TypeGuards.isExpression(init)) {
			const initKindName = init.getKindName();
			throw new TranspilerError(
				`ForOf Loop did not expect expression initializer! (${initKindName})`,
				init,
				TranspilerErrorType.UnexpectedInitializer,
			);
		}

		if (varName.length === 0) {
			throw new TranspilerError(`ForOf Loop empty varName!`, init, TranspilerErrorType.ForEmptyVarName);
		}

		const expStr = this.transpileExpression(node.getExpression());
		let result = "";
		result += this.indent + `for _, ${varName} in pairs(${expStr}) do\n`;
		this.pushIndent();
		initializers.forEach(initializer => (result += this.indent + initializer));
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

	private getFirstFunctionLikeAncestor(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
		for (const ancestor of node.getAncestors()) {
			if (
				ts.TypeGuards.isFunctionDeclaration(ancestor) ||
				ts.TypeGuards.isMethodDeclaration(ancestor) ||
				ts.TypeGuards.isFunctionExpression(ancestor) ||
				ts.TypeGuards.isArrowFunction(ancestor)
			) {
				return ancestor;
			}
		}
		return undefined;
	}

	private transpileReturnStatement(node: ts.ReturnStatement) {
		const exp = node.getExpression();
		if (exp) {
			const ancestor = this.getFirstFunctionLikeAncestor(node);
			if (ancestor) {
				if (isTupleLike(ancestor.getReturnType())) {
					if (ts.TypeGuards.isArrayLiteralExpression(exp)) {
						let expStr = this.transpileExpression(exp);
						expStr = expStr.substr(2, expStr.length - 4);
						return this.indent + `return ${expStr};\n`;
					} else if (ts.TypeGuards.isCallExpression(exp) && isTupleLike(exp.getReturnType())) {
						const expStr = this.transpileCallExpression(exp, true);
						return this.indent + `return ${expStr};\n`;
					} else {
						const expStr = this.transpileExpression(exp);
						return this.indent + `return unpack(${expStr});\n`;
					}
				}
			}
			return this.indent + `return ${this.transpileExpression(exp)};\n`;
		} else {
			return this.indent + `return;\n`;
		}
	}

	private transpileThrowStatement(node: ts.ThrowStatement) {
		const expStr = this.transpileExpression(node.getExpressionOrThrow());
		return this.indent + `TS.error(${expStr});\n`;
	}

	private transpileVariableDeclarationList(node: ts.VariableDeclarationList) {
		const declarationKind = node.getDeclarationKind();
		if (declarationKind === ts.VariableDeclarationKind.Var) {
			throw new TranspilerError(
				"'var' keyword is not supported! Use 'let' or 'const' instead.",
				node,
				TranspilerErrorType.NoVarKeyword,
			);
		}

		const parent = node.getParent();
		const names = new Array<string>();
		const values = new Array<string>();
		const preStatements = new Array<string>();
		const postStatements = new Array<string>();
		const declarations = node.getDeclarations();
		const isExported = parent && ts.TypeGuards.isVariableStatement(parent) && parent.isExported();
		let parentName: string | undefined;

		if (isExported) {
			parentName = this.getExportContextName(parent);
		}

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
					.every(bindingElement => bindingElement.getChildAtIndex(0).getKind() === ts.SyntaxKind.Identifier);
				if (isFlatBinding && rhs && ts.TypeGuards.isCallExpression(rhs) && isTupleLike(rhs.getReturnType())) {
					for (const element of lhs.getElements()) {
						if (ts.TypeGuards.isBindingElement(element)) {
							names.push(element.getChildAtIndex(0).getText());
						} else if (ts.TypeGuards.isOmittedExpression(element)) {
							names.push("_");
						}
					}
					values.push(this.transpileCallExpression(rhs, true));
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
					values.push(rhsStr);
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
						const rhsStr = this.transpileExpression(rhs as ts.Expression);
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

		let result = "";
		preStatements.forEach(statementStr => (result += this.indent + statementStr + "\n"));

		if (values.length > 0) {
			const valuesStr = values.join(", ");

			if (isExported) {
				const namesStr = names.join(`, ${parentName}.`);
				result += this.indent + `${parentName}.${namesStr} = ${valuesStr};\n`;
			} else {
				const namesStr = names.join(", ");
				result += this.indent + `local ${namesStr} = ${valuesStr};\n`;
			}
		} else {
			result += this.indent + `local ${names.join(", ")};\n`;
		}

		postStatements.forEach(statementStr => (result += this.indent + statementStr + "\n"));
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
		const name = node.getName() || this.getNewId();
		this.checkReserved(name, node);
		this.pushExport(name, node);
		const body = node.getBody();
		if (!body) {
			return "";
		}
		this.hoistStack[this.hoistStack.length - 1].add(name);
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

	private transpileRoactClassDeclaration(
		type: "Component" | "PureComponent",
		className: string,
		node: ts.ClassDeclaration | ts.ClassExpression,
	) {
		let declaration = `${this.indent}local ${className} = Roact.${type}:extend("${className}");\n`;

		const instanceProps = node
			.getInstanceProperties()
			// @ts-ignore
			.filter(prop => prop.getParent() === node)
			.filter(prop => !ts.TypeGuards.isGetAccessorDeclaration(prop))
			.filter(prop => !ts.TypeGuards.isSetAccessorDeclaration(prop));

		const extraInitializers = new Array<string>();

		if (instanceProps.length > 0) {
			for (const prop of instanceProps) {
				const propName = prop.getName();

				if (propName) {
					this.checkMethodReserved(propName, prop);

					if (ts.TypeGuards.isInitializerExpressionableNode(prop)) {
						const initializer = prop.getInitializer();
						if (initializer) {
							extraInitializers.push(`self.${propName} = ${this.transpileExpression(initializer)};`);
						}
					}
				}
			}
		}

		const constructor = getConstructor(node);
		if (constructor) {
			const paramNames = new Array<string>();
			const initializers = new Array<string>();
			const defaults = new Array<string>();

			this.getParameterData(paramNames, initializers, constructor, defaults);

			declaration += `${this.indent}function ${className}:init(${paramNames.join(", ")})\n`;

			this.pushIndent();

			const body = constructor.getBodyOrThrow();
			if (ts.TypeGuards.isBlock(body)) {
				// we can ignore super() as it's not required.
				if (ts.TypeGuards.isBlock(body)) {
					defaults.forEach(initializer => (declaration += this.indent + initializer + "\n"));

					const bodyStatements = body.getStatements();
					let k = 0;

					initializers.forEach(initializer => (declaration += this.indent + initializer + "\n"));
					extraInitializers.forEach(initializer => (declaration += this.indent + initializer + "\n"));

					for (; k < bodyStatements.length; ++k) {
						const bodyStatement = bodyStatements[k];

						// Because we want to ignore super. I will figure out a better way to do this eventually.
						// isSuperExpression doesn't seem to work.
						if (!bodyStatement.getText().startsWith("super")) {
							declaration += this.transpileStatement(bodyStatement);
						}
					}

					const returnStatement = body.getStatementByKind(ts.SyntaxKind.ReturnStatement);

					if (returnStatement) {
						throw new TranspilerError(
							`Cannot use return statement in constructor for ${className}`,
							returnStatement,
							TranspilerErrorType.NoConstructorReturn,
						);
					}
				}
			}

			this.popIndent();

			declaration += `${this.indent}end;\n`;
		}

		const staticFields = node.getStaticProperties();
		for (const staticField of staticFields) {
			if (ts.TypeGuards.isInitializerExpressionableNode(staticField)) {
				const initializer = staticField.getInitializer();
				if (initializer) {
					declaration += `${this.indent}${className}.${staticField.getName()} = ${this.transpileExpression(
						initializer,
					)};\n`;
				}
			}
		}

		const staticMethods = node.getStaticMethods().filter(method => method.getBody() !== undefined);
		for (const staticMethod of staticMethods) {
			const name = staticMethod.getName();
			this.checkReserved(name, staticMethod);
			const body = staticMethod.getBodyOrThrow();

			const paramNames = new Array<string>();
			const initializers = new Array<string>();
			this.pushIdStack();
			this.getParameterData(paramNames, initializers, staticMethod);
			const paramStr = paramNames.join(", ");

			declaration += `${this.indent}function ${className}.${name}(${paramStr})\n`;

			this.pushIndent();
			if (ts.TypeGuards.isBlock(body)) {
				initializers.forEach(initializer => (declaration += this.indent + initializer + "\n"));
				declaration += this.transpileBlock(body);
			}
			this.popIndent();

			declaration += `${this.indent}end;\n`;
		}

		// Now we'll get the methods, and make them into the special roact format
		const methods = node.getInstanceMethods().filter(method => method.getBody() !== undefined);

		for (const method of methods) {
			const name = method.getName();
			this.checkReserved(name, method);
			const body = method.getBodyOrThrow();

			const paramNames = new Array<string>();
			const initializers = new Array<string>();
			this.pushIdStack();
			this.getParameterData(paramNames, initializers, method);
			const paramStr = paramNames.join(", ");

			declaration += `${this.indent}function ${className}:${name}(${paramStr})\n`;

			this.pushIndent();
			if (ts.TypeGuards.isBlock(body)) {
				initializers.forEach(initializer => (declaration += this.indent + initializer + "\n"));
				declaration += this.transpileBlock(body);
			}
			this.popIndent();

			declaration += `${this.indent}end;\n`;
		}

		const getters = node
			.getInstanceProperties()
			.filter((prop): prop is ts.GetAccessorDeclaration => ts.TypeGuards.isGetAccessorDeclaration(prop));
		if (getters.length > 0) {
			throw new TranspilerError(
				"Roact does not support getters",
				node,
				TranspilerErrorType.RoactGettersNotAllowed,
			);
		}

		const setters = node
			.getInstanceProperties()
			.filter((prop): prop is ts.SetAccessorDeclaration => ts.TypeGuards.isSetAccessorDeclaration(prop));
		if (setters.length > 0) {
			throw new TranspilerError(
				"Roact does not support setters",
				node,
				TranspilerErrorType.RoactSettersNotAllowed,
			);
		}

		return declaration;
	}

	private transpileClassDeclaration(
		node: ts.ClassDeclaration | ts.ClassExpression,
		name: string = node.getName() || this.getNewId(),
	) {
		const nameNode = node.getNameNode();
		if (nameNode) {
			this.checkReserved(name, nameNode);
		}

		if (ts.TypeGuards.isClassDeclaration(node)) {
			this.pushExport(name, node);
		}

		const baseTypes = node.getBaseTypes();
		for (const baseType of baseTypes) {
			const baseTypeText = baseType.getText();

			// Handle the special case where we have a roact class
			if (baseTypeText.startsWith(ROACT_COMPONENT_TYPE)) {
				return this.transpileRoactClassDeclaration("Component", name, node);
			} else if (baseTypeText.startsWith(ROACT_PURE_COMPONENT_TYPE)) {
				return this.transpileRoactClassDeclaration("PureComponent", name, node);
			}

			if (inheritsFromRoact(baseType)) {
				throw new TranspilerError(
					"Derived Classes are not supported in Roact!",
					node,
					TranspilerErrorType.RoactSubClassesNotSupported,
				);
			}
		}

		this.hoistStack[this.hoistStack.length - 1].add(name);

		let result = "";
		result += this.indent + `do\n`;
		this.pushIndent();

		let baseClassName = "";
		const extendsClause = node.getHeritageClauseByKind(ts.SyntaxKind.ExtendsKeyword);
		if (extendsClause) {
			const typeNode = extendsClause.getTypeNodes()[0];
			if (typeNode) {
				baseClassName = this.transpileExpression(typeNode.getExpression());
			}
		}

		const id = name;
		let hasStaticMembers = false;
		let hasStaticInheritance = false;
		let hasInstanceInheritance = false;
		let currentBaseClass = node.getBaseClass();

		while (currentBaseClass) {
			if (
				currentBaseClass.getStaticMembers().length > 0 ||
				currentBaseClass.getStaticProperties().length > 0 ||
				currentBaseClass.getStaticMethods().length > 0
			) {
				hasStaticInheritance = true;
			}

			if (
				currentBaseClass.getInstanceMembers().length > 0 ||
				currentBaseClass.getInstanceProperties().length > 0 ||
				currentBaseClass.getInstanceMethods().length > 0
			) {
				hasInstanceInheritance = true;
			}

			currentBaseClass = currentBaseClass.getBaseClass();
		}

		if (hasStaticInheritance || hasInstanceInheritance) {
			result += this.indent + `local super = ${baseClassName};\n`;
		}

		if (hasStaticInheritance) {
			result += this.indent + `${id} = setmetatable({`;
		} else {
			result += this.indent + `${id} = {`;
		}

		this.pushIndent();

		node.getStaticMethods()
			.filter(method => method.getBody() !== undefined)
			.forEach(method => {
				if (!hasStaticMembers) {
					hasStaticMembers = true;
					result += "\n";
				}
				result += this.indent + this.transpileMethodDeclaration(method);
			});

		this.popIndent();

		if (hasStaticInheritance) {
			result += `${hasStaticMembers ? this.indent : ""}}, {__index = super});\n`;
		} else {
			result += `${hasStaticMembers ? this.indent : ""}};\n`;
		}

		if (hasInstanceInheritance) {
			result += this.indent + `${id}.__index = setmetatable({`;
		} else {
			result += this.indent + `${id}.__index = {`;
		}

		this.pushIndent();
		let hasIndexMembers = false;

		const extraInitializers = new Array<string>();
		const instanceProps = node
			.getInstanceProperties()
			// @ts-ignore
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

		node.getInstanceMethods()
			.filter(method => method.getBody() !== undefined)
			.forEach(method => {
				if (!hasIndexMembers) {
					hasIndexMembers = true;
					result += "\n";
				}
				result += this.indent + this.transpileMethodDeclaration(method);
			});

		this.popIndent();

		if (hasInstanceInheritance) {
			result += `${hasIndexMembers ? this.indent : ""}}, super);\n`;
		} else {
			result += `${hasIndexMembers ? this.indent : ""}};\n`;
		}

		LUA_RESERVED_METAMETHODS.forEach(metamethod => {
			if (getClassMethod(node, metamethod)) {
				if (LUA_UNDEFINABLE_METAMETHODS.indexOf(metamethod) !== -1) {
					throw new TranspilerError(
						`Cannot use undefinable Lua metamethod as identifier '${metamethod}' for a class`,
						node,
						TranspilerErrorType.UndefinableMetamethod,
					);
				}
				result +=
					this.indent + `${id}.${metamethod} = function(self, ...) return self:${metamethod}(...); end;\n`;
			}
		});

		if (!node.isAbstract()) {
			result += this.indent + `${id}.new = function(...)\n`;
			this.pushIndent();
			result += this.indent + `return ${id}.constructor(setmetatable({}, ${id}), ...);\n`;
			this.popIndent();
			result += this.indent + `end;\n`;
		}

		result += this.transpileConstructorDeclaration(
			id,
			getConstructor(node),
			extraInitializers,
			hasInstanceInheritance,
		);

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
		let ancestorClass: ts.ClassDeclaration | ts.ClassExpression | undefined = node;
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
						this.indent +
						`${id}._getters = setmetatable({${getterContent}}, { __index = super._getters });\n`;
				} else {
					result += this.indent + `${id}._getters = {${getterContent}};\n`;
				}
			} else {
				result += this.indent + `${id}._getters = super._getters;\n`;
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
						this.indent +
						`${id}._setters = setmetatable({${setterContent}}, { __index = super._setters });\n`;
				} else {
					result += this.indent + `${id}._setters = {${setterContent}};\n`;
				}
			} else {
				result += this.indent + `${id}._setters = super._setters;\n`;
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
		hasInstanceInheritance?: boolean,
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
						TranspilerErrorType.NoConstructorReturn,
					);
				}
			}
		} else {
			if (hasInstanceInheritance) {
				result += this.indent + `super.constructor(self, ...);\n`;
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

	private transpileAccessorDeclaration(node: ts.GetAccessorDeclaration | ts.SetAccessorDeclaration, name: string) {
		const body = node.getBody();
		if (!body) {
			return "";
		}
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

	private transpileMethodDeclaration(node: ts.MethodDeclaration) {
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
			result += `${name} = TS.async(function(${paramStr})\n`;
		} else {
			result += `${name} = function(${paramStr})\n`;
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

	private isTypeOnlyNamespace(node: ts.NamespaceDeclaration) {
		const statements = node.getStatements();
		for (const statement of statements) {
			if (!ts.TypeGuards.isNamespaceDeclaration(statement) && !isType(statement)) {
				return false;
			}
		}
		for (const statement of statements) {
			if (ts.TypeGuards.isNamespaceDeclaration(statement) && !this.isTypeOnlyNamespace(statement)) {
				return false;
			}
		}
		return true;
	}

	private transpileNamespaceDeclaration(node: ts.NamespaceDeclaration) {
		if (this.isTypeOnlyNamespace(node)) {
			return "";
		}
		this.pushIdStack();
		const name = node.getName();
		this.checkReserved(name, node);
		const parentNamespace = node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);
		this.pushExport(name, node);
		this.hoistStack[this.hoistStack.length - 1].add(name);
		let result = "";
		const id = this.getNewId();
		if (parentNamespace) {
			const parentName = this.safeMapGet(this.namespaceStack, parentNamespace, node);
			result += this.indent + `${name} = ${parentName}.${name} or {} do\n`;
		} else {
			result += this.indent + `${name} = ${name} or {} do\n`;
		}
		this.pushIndent();
		result += this.indent + `local ${id} = ${name};\n`;
		this.namespaceStack.set(node, id);
		result += this.transpileStatementedNode(node);
		this.popIndent();
		result += this.indent + `end;\n`;
		this.popIdStack();
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
		this.hoistStack[this.hoistStack.length - 1].add(name);
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
		let result = this.indent;

		if (node.isExportEquals()) {
			this.isModule = true;
			const exp = node.getExpression();
			if (ts.TypeGuards.isClassExpression(exp)) {
				const className = exp.getName() || this.getNewId();
				result += this.transpileClassDeclaration(exp, className);
				result += this.indent;
				result += `_exports = ${className};\n`;
			} else {
				const expStr = this.transpileExpression(exp);
				result += `_exports = ${expStr};\n`;
			}
		} else {
			const symbol = node.getSymbol();
			if (symbol) {
				if (symbol.getName() === "default") {
					this.isModule = true;
					result += "_exports._default = " + this.transpileExpression(node.getExpression()) + ";\n";
				}
			}
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

		const clauses = node.getCaseBlock().getClauses();
		let anyFallThrough = false;
		for (const clause of clauses) {
			const statements = clause.getStatements();

			let lastStatement = statements[statements.length - 1];
			while (ts.TypeGuards.isBlock(lastStatement)) {
				const blockStatements = lastStatement.getStatements();
				lastStatement = blockStatements[blockStatements.length - 1];
			}
			const endsInReturnOrBreakStatement =
				lastStatement &&
				(ts.TypeGuards.isReturnStatement(lastStatement) || ts.TypeGuards.isBreakStatement(lastStatement));
			if (!endsInReturnOrBreakStatement) {
				anyFallThrough = true;
			}
		}

		if (anyFallThrough) {
			result += this.indent + `local ${fallThroughVar} = false;\n`;
		}

		let lastFallThrough = false;

		for (const clause of clauses) {
			// add if statement if the clause is non-default
			if (ts.TypeGuards.isCaseClause(clause)) {
				const clauseExpStr = this.transpileExpression(clause.getExpression());
				const fallThroughVarOr = lastFallThrough ? `${fallThroughVar} or ` : "";
				result += this.indent + `if ${fallThroughVarOr}${expStr} == ( ${clauseExpStr} ) then\n`;
				this.pushIndent();
			}

			const statements = clause.getStatements();

			let lastStatement = statements[statements.length - 1];
			while (ts.TypeGuards.isBlock(lastStatement)) {
				const blockStatements = lastStatement.getStatements();
				lastStatement = blockStatements[blockStatements.length - 1];
			}
			const endsInReturnOrBreakStatement =
				lastStatement &&
				(ts.TypeGuards.isReturnStatement(lastStatement) || ts.TypeGuards.isBreakStatement(lastStatement));
			lastFallThrough = !endsInReturnOrBreakStatement;

			result += this.transpileStatementedNode(clause);

			if (ts.TypeGuards.isCaseClause(clause)) {
				if (!endsInReturnOrBreakStatement) {
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

	private transpileTryStatement(node: ts.TryStatement) {
		let result = "";
		result += this.indent + "local TS_success, TS_error = pcall(function()\n";
		this.pushIndent();
		result += this.transpileStatementedNode(node.getTryBlock());
		this.popIndent();
		result += this.indent + "end);\n";
		const catchClause = node.getCatchClause();
		if (catchClause !== undefined) {
			result += this.indent + "if not TS_success then\n";
			this.pushIndent();
			result +=
				this.indent +
				"local " +
				catchClause.getVariableDeclarationOrThrow().getName() +
				" = TS.decodeError(TS_error)\n";
			result += this.transpileStatementedNode(catchClause.getBlock());
			this.popIndent();
			result += this.indent + "end\n";
		}
		const finallyBlock = node.getFinallyBlock();
		if (finallyBlock !== undefined) {
			result += this.transpileStatementedNode(finallyBlock);
		}
		return result;
	}

	private transpileExpression(node: ts.Expression): string {
		if (ts.TypeGuards.isStringLiteral(node) || ts.TypeGuards.isNoSubstitutionTemplateLiteral(node)) {
			return this.transpileStringLiteral(node);
		} else if (ts.TypeGuards.isNumericLiteral(node)) {
			return this.transpileNumericLiteral(node);
		} else if (ts.TypeGuards.isBooleanLiteral(node)) {
			return this.transpileBooleanLiteral(node);
		} else if (ts.TypeGuards.isArrayLiteralExpression(node)) {
			return this.transpileArrayLiteralExpression(node);
		} else if (ts.TypeGuards.isObjectLiteralExpression(node)) {
			return this.transpileObjectLiteralExpression(node);
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
		} else if (ts.TypeGuards.isJsxExpression(node)) {
			return this.transpileExpression(node.getExpressionOrThrow());
		} else if (ts.TypeGuards.isJsxSelfClosingElement(node)) {
			return this.transpileJsxSelfClosingElement(node);
		} else if (ts.TypeGuards.isJsxElement(node)) {
			return this.transpileJsxElement(node);
		} else if (ts.TypeGuards.isSpreadElement(node)) {
			return this.transpileSpreadElement(node);
		} else if (ts.TypeGuards.isClassExpression(node)) {
			return this.transpileClassDeclaration(node);
		} else if (ts.TypeGuards.isOmittedExpression(node)) {
			return "nil";
		} else if (ts.TypeGuards.isThisExpression(node)) {
			if (
				!node.getFirstAncestorByKind(ts.SyntaxKind.ClassDeclaration) &&
				!node.getFirstAncestorByKind(ts.SyntaxKind.ObjectLiteralExpression)
			) {
				throw new TranspilerError(
					"'this' may only be used inside a class definition or object literal",
					node,
					TranspilerErrorType.NoThisOutsideClass,
				);
			}
			return "self";
		} else if (ts.TypeGuards.isSuperExpression(node)) {
			return "super";
		} else if (
			ts.TypeGuards.isAsExpression(node) ||
			ts.TypeGuards.isTypeAssertion(node) ||
			ts.TypeGuards.isNonNullExpression(node)
		) {
			return this.transpileExpression(node.getExpression());
		} else if (ts.TypeGuards.isNullLiteral(node)) {
			throw new TranspilerError(
				"'null' is not supported! Use 'undefined' instead.",
				node,
				TranspilerErrorType.NoNull,
			);
		} else if (ts.TypeGuards.isImportExpression(node)) {
			throw new TranspilerError(
				"Dynamic import expressions are not supported! Use 'require()' instead and assert the type.",
				node,
				TranspilerErrorType.NoDynamicImport,
			);
		} else {
			const kindName = node.getKindName();
			throw new TranspilerError(`Bad expression! (${kindName})`, node, TranspilerErrorType.BadExpression);
		}
	}

	private generateRoactSymbolProperty(
		roactSymbol: "Event" | "Change" | "Ref",
		node: ts.JsxAttributeLike,
		attributeCollection: Array<string>,
		hasExtraAttributes: boolean = false,
	) {
		const expr = node.getChildrenOfKind(ts.SyntaxKind.JsxExpression);
		for (const expression of expr) {
			const innerExpression = expression.getExpressionOrThrow();
			if (ts.TypeGuards.isObjectLiteralExpression(innerExpression)) {
				const properties = innerExpression.getProperties();
				for (const property of properties) {
					if (
						ts.TypeGuards.isPropertyAssignment(property) ||
						ts.TypeGuards.isShorthandPropertyAssignment(property)
					) {
						const propName = property.getName();
						const rhs = property.getInitializerOrThrow();
						let value: string;

						if (ts.TypeGuards.isPropertyAccessExpression(rhs)) {
							const getAccessExpression = rhs.getExpression();
							if (ts.TypeGuards.isThisExpression(getAccessExpression)) {
								value = `function(...)`;
								value += ` ${this.transpileExpression(rhs)}(self, ...); `;
								value += "end";
							} else {
								if (hasExtraAttributes) {
									this.pushIndent(); // fix indentation with extra props
								}
								value = this.transpileExpression(rhs);
							}
						} else {
							if (hasExtraAttributes) {
								this.pushIndent(); // fix indentation with extra props
							}
							value = this.transpileExpression(rhs);
						}

						if (hasExtraAttributes) {
							this.popIndent(); // fix indentation with extra props
						}

						attributeCollection.push(`[Roact.${roactSymbol}.${propName}] = ${value}`);
					}
				}
			} else if (roactSymbol === "Ref") {
				let value: string;

				if (ts.TypeGuards.isPropertyAccessExpression(innerExpression)) {
					const getAccessExpression = innerExpression.getExpression();
					if (ts.TypeGuards.isThisExpression(getAccessExpression)) {
						// hacky typeof until I can figure out how to tell the difference between this.method and this.property
						const expressionValue = this.transpileExpression(innerExpression);
						value = `typeof(${expressionValue}) == 'function' and function(...)`;
						this.pushIndent();
						value += ` ${expressionValue}(self, ...); `;
						value += `end or ${expressionValue}`;
					} else {
						if (hasExtraAttributes) {
							this.pushIndent(); // fix indentation with extra props
						}
						value = this.transpileExpression(getAccessExpression);
					}
				} else {
					if (hasExtraAttributes) {
						this.pushIndent(); // fix indentation with extra props
					}
					value = this.transpileExpression(innerExpression);
				}

				if (hasExtraAttributes) {
					this.popIndent();
				}

				attributeCollection.push(`[Roact.Ref] = ${value}`);
			} else {
				throw new TranspilerError(
					`Roact symbol ${roactSymbol} does not support (${innerExpression.getKindName()})`,
					node,
					TranspilerErrorType.RoactInvalidSymbol,
				);
			}
		}
	}

	private generateRoactElement(
		name: string,
		attributes: Array<ts.JsxAttributeLike>,
		children: Array<ts.JsxChild>,
	): string {
		let str = `Roact.createElement(`;
		const attributeCollection = new Array<string>();
		const extraAttributeCollections = new Array<string>();
		const extraChildrenCollection = new Array<string>();
		const childCollection = new Array<string>();
		let key: string | undefined;

		this.roactIndent++;

		if (name.match(/^[a-z]+$/)) {
			// if lowercase

			// Check if defined as a intrinsic mapping
			const rbxName = INTRINSIC_MAPPINGS[name];
			if (rbxName) {
				str += `"${rbxName}"`;
			}
		} else {
			str += name;
		}

		if (attributes.length > 0) {
			this.pushIndent();

			const extraAttributes = attributes.filter(attr => ts.TypeGuards.isJsxSpreadAttribute(attr));

			for (const attributeLike of attributes) {
				if (ts.TypeGuards.isJsxSpreadAttribute(attributeLike)) {
					const expression = attributeLike.getExpression();
					extraAttributeCollections.push(this.transpileExpression(expression));
				} else {
					const attribute = attributeLike as ts.JsxAttribute;
					const attributeName = attribute.getName();
					const value = this.transpileExpression(attribute.getInitializerOrThrow());

					if (attributeName === "Key") {
						// handle setting a key for this element
						key = value;
					} else if (attributeName === "Event") {
						// handle [Roact.Event]
						this.generateRoactSymbolProperty(
							"Event",
							attributeLike,
							attributeCollection,
							extraAttributes.length > 0,
						);
					} else if (attributeName === "Change") {
						// handle [Roact.Change]
						this.generateRoactSymbolProperty(
							"Change",
							attributeLike,
							attributeCollection,
							extraAttributes.length > 0,
						);
					} else if (attributeName === "Ref") {
						// handle [Roact.Ref]
						this.generateRoactSymbolProperty(
							"Ref",
							attributeLike,
							attributeCollection,
							extraAttributes.length > 0,
						);
					} else {
						attributeCollection.push(`${attributeName} = ${value}`);
					}
				}
			}

			this.popIndent();

			// use Object.assign if we have extra attributes
			if (extraAttributeCollections.length > 0) {
				str += ", \n";
				this.pushIndent();

				str += this.indent + "TS.Roact_combine(";

				// If it has other attributes
				if (attributeCollection.length > 0) {
					str += "{\n";

					this.pushIndent();
					str += this.indent + attributeCollection.join(",\n" + this.indent);
					this.popIndent();
					str += ` \n${this.indent}},\n${this.indent}`;
				} else {
					str += `{}, `;
				}

				str += extraAttributeCollections.join(",\n" + this.indent);
				str += ")\n";

				this.popIndent();
			} else {
				str += ", {\n";
				this.pushIndent();
				str += this.indent + attributeCollection.join(",\n" + this.indent);
				this.popIndent();
				str += ` \n${this.indent}}`;
			}
		} else {
			str += ", {}";
		}

		if (children.length > 0) {
			this.pushIndent();

			for (const child of children) {
				if (ts.TypeGuards.isJsxElement(child) || ts.TypeGuards.isJsxSelfClosingElement(child)) {
					const value = this.transpileExpression(child);
					childCollection.push(`${this.indent}${value}`);
				} else if (ts.TypeGuards.isJsxText(child)) {
					// If the inner text isn't just indentation/spaces
					if (child.getText().match(/[^\s]/)) {
						throw new TranspilerError(
							"Roact does not support text!",
							child,
							TranspilerErrorType.RoactJsxTextNotSupported,
						);
					}
				} else if (ts.TypeGuards.isJsxExpression(child)) {
					const expression = child.getExpressionOrThrow();
					if (ts.TypeGuards.isCallExpression(expression)) {
						// Must return Roact.Element :(
						const returnType = expression.getReturnType();
						if (isRoactElementType(returnType)) {
							if (returnType.isArray()) {
								// Roact.Element[]
								extraChildrenCollection.push(this.indent + this.transpileExpression(expression));
							} else {
								// Roact.Element
								extraChildrenCollection.push(
									this.indent + `{ ${this.transpileExpression(expression)} }`,
								);
							}
						} else {
							throw new TranspilerError(
								`Function call in an expression must return Roact.Element or Roact.Element[]`,
								expression,
								TranspilerErrorType.RoactInvalidCallExpression,
							);
						}
					} else if (ts.TypeGuards.isIdentifier(expression)) {
						const definitionNodes = expression.getDefinitionNodes();
						for (const definitionNode of definitionNodes) {
							const type = definitionNode.getType();
							if (isRoactElementType(type)) {
								extraChildrenCollection.push(this.indent + this.transpileExpression(expression));
							} else {
								throw new TranspilerError(
									`Roact does not support identifiers that have the return type ` + type.getText(),
									expression,
									TranspilerErrorType.RoactInvalidIdentifierExpression,
								);
							}
						}
					} else if (
						ts.TypeGuards.isPropertyAccessExpression(expression) ||
						ts.TypeGuards.isElementAccessExpression(expression)
					) {
						const propertyType = expression.getType();

						if (isRoactElementType(propertyType)) {
							extraChildrenCollection.push(this.transpileExpression(expression));
						} else {
							throw new TranspilerError(
								`Roact does not support the property type ` + propertyType.getText(),
								expression,
								TranspilerErrorType.RoactInvalidPropertyExpression,
							);
						}
					} else {
						throw new TranspilerError(
							`Roact does not support this type of expression ` +
								`{${expression.getText()}} (${expression.getKindName()})`,
							expression,
							TranspilerErrorType.RoactInvalidExpression,
						);
					}
				}
			}

			this.popIndent();

			if (extraChildrenCollection.length > 0) {
				str += `, TS.Roact_combine(`;

				if (childCollection.length > 0) {
					str += "{\n" + this.indent;
					str += childCollection.join(",\n") + `\n${this.indent}}, `;
				}

				str += "\n";
				str += extraChildrenCollection.join(",\n") + `\n`;

				str += this.indent + ")";
				str += ")";
			} else {
				// this.pushIndent();
				str += this.indent + ", {\n";
				str += childCollection.join(",\n") + `\n${this.indent}})`;
			}
		} else {
			if (extraAttributeCollections.length > 0) {
				str += this.indent + ")";
			} else {
				str += ")";
			}
		}

		this.roactIndent--;

		if (key && this.roactIndent > 0) {
			return `[${key}] = ${str}`;
		} else {
			return str;
		}
	}

	private transpileJsxElement(node: ts.JsxElement): string {
		if (!this.hasRoactImport) {
			throw new TranspilerError(
				"Cannot use JSX without importing Roact first!\n" +
					suggest('To fix this, put `import * as Roact from "rbx-roact"` at the top of this file.'),
				node,
				TranspilerErrorType.RoactJsxWithoutImport,
			);
		}
		const open = node.getOpeningElement() as ts.JsxOpeningElement;
		const tagNameNode = open.getTagNameNode();
		const tagName = tagNameNode.getText();
		const children = node.getJsxChildren();
		const isArrayExpressionParent = node.getParentIfKind(ts.ts.SyntaxKind.ArrayLiteralExpression);

		if (isArrayExpressionParent) {
			this.roactIndent++;
		}

		const element = this.generateRoactElement(tagName, open.getAttributes(), children);

		if (isArrayExpressionParent) {
			this.roactIndent--;
		}

		return element;
	}

	private transpileJsxSelfClosingElement(node: ts.JsxSelfClosingElement): string {
		if (!this.hasRoactImport) {
			throw new TranspilerError(
				"Cannot use JSX without importing Roact first!\n" +
					suggest('To fix this, put `import * as Roact from "rbx-roact"` at the top of this file.'),
				node,
				TranspilerErrorType.RoactJsxWithoutImport,
			);
		}

		const tagNameNode = node.getTagNameNode();
		const tagName = tagNameNode.getText();
		const isArrayExpressionParent = node.getParentIfKind(ts.ts.SyntaxKind.ArrayLiteralExpression);

		if (isArrayExpressionParent) {
			this.roactIndent++;
		}

		const element = this.generateRoactElement(tagName, node.getAttributes(), []);

		if (isArrayExpressionParent) {
			this.roactIndent--;
		}

		return element;
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
		const text = node.getText();
		if (text.indexOf("e") !== -1) {
			return text;
		}
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
		let isInArray = false;
		const parts = new Array<Array<string> | string>();
		elements.forEach(element => {
			if (ts.TypeGuards.isSpreadElement(element)) {
				parts.push(this.transpileExpression(element.getExpression()));
				isInArray = false;
			} else {
				let last: Array<string>;
				if (isInArray) {
					last = parts[parts.length - 1] as Array<string>;
				} else {
					last = new Array<string>();
					parts.push(last);
				}
				last.push(this.transpileExpression(element));
				isInArray = true;
			}
		});

		const params = parts.map(v => (typeof v === "string" ? v : `{ ${v.join(", ")} }`)).join(", ");
		if (elements.some(v => ts.TypeGuards.isSpreadElement(v))) {
			return `TS.array_concat(${params})`;
		} else {
			return params;
		}
	}

	private transpileObjectLiteralExpression(node: ts.ObjectLiteralExpression) {
		const properties = node.getProperties();
		if (properties.length === 0) {
			return "{}";
		}

		let isInObject = false;
		let first = true;
		let firstIsObj = false;
		const parts = new Array<string>();
		for (const prop of properties) {
			if (ts.TypeGuards.isPropertyAssignment(prop) || ts.TypeGuards.isShorthandPropertyAssignment(prop)) {
				if (first) {
					firstIsObj = true;
				}

				let lhs: string;

				let n = 0;
				let child = prop.getChildAtIndex(n);
				while (ts.TypeGuards.isJSDoc(child)) {
					n++;
					child = prop.getChildAtIndex(n);
				}

				if (ts.TypeGuards.isComputedPropertyName(child)) {
					const expStr = this.transpileExpression(child.getExpression());
					lhs = `[${expStr}]`;
				} else if (ts.TypeGuards.isStringLiteral(child)) {
					const expStr = this.transpileStringLiteral(child);
					lhs = `[${expStr}]`;
				} else if (ts.TypeGuards.isIdentifier(child)) {
					lhs = this.transpileIdentifier(child);
					this.checkReserved(lhs, child);
				} else {
					throw new TranspilerError(
						`Unexpected type of object index! (${child.getKindName()})`,
						child,
						TranspilerErrorType.UnexpectedObjectIndex,
					);
				}

				if (!isInObject) {
					parts.push("{\n");
					this.pushIndent();
				}

				let rhs: string; // You may want to move this around
				if (ts.TypeGuards.isShorthandPropertyAssignment(prop) && ts.TypeGuards.isIdentifier(child)) {
					lhs = prop.getName();
					rhs = this.transpileIdentifier(child);
					this.checkReserved(lhs, child);
				} else {
					rhs = this.transpileExpression(prop.getInitializerOrThrow());
				}

				parts[parts.length - 1] += this.indent + `${lhs} = ${rhs};\n`;
				isInObject = true;
			} else if (ts.TypeGuards.isMethodDeclaration(prop)) {
				if (first) {
					firstIsObj = true;
				}
				if (!isInObject) {
					parts.push("{\n");
					this.pushIndent();
				}
				parts[parts.length - 1] += this.indent + this.transpileMethodDeclaration(prop);
				isInObject = true;
			} else if (ts.TypeGuards.isSpreadAssignment(prop)) {
				if (first) {
					firstIsObj = false;
				}
				if (isInObject) {
					this.popIndent();
					parts[parts.length - 1] += this.indent + "}";
				}
				const expStr = this.transpileExpression(prop.getExpression());
				parts.push(expStr);
				isInObject = false;
			}
			if (first) {
				first = false;
			}
		}

		if (isInObject) {
			this.popIndent();
			parts[parts.length - 1] += this.indent + "}";
		}

		if (properties.some(v => ts.TypeGuards.isSpreadAssignment(v))) {
			const params = parts.join(", ");
			if (!firstIsObj) {
				return `TS.Object_assign({}, ${params})`;
			} else {
				return `TS.Object_assign(${params})`;
			}
		} else {
			return parts.join(", ");
		}
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
			throw new TranspilerError(`Bad function body (${bodyKindName})`, node, TranspilerErrorType.BadFunctionBody);
		}
		if (node.isAsync()) {
			result = `TS.async(${result})`;
		}
		this.popIdStack();
		return result;
	}

	private transpileCallExpression(node: ts.CallExpression, doNotWrapTupleReturn = false) {
		const exp = node.getExpression();
		if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
			return this.transpilePropertyCallExpression(node, doNotWrapTupleReturn);
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
			let result = `${callPath}(${params})`;
			if (!doNotWrapTupleReturn && isTupleLike(node.getReturnType())) {
				result = `{ ${result} }`;
			}
			return result;
		}
	}

	private transpilePropertyCallExpression(node: ts.CallExpression, doNotWrapTupleReturn = false) {
		const expression = node.getExpression();
		if (!ts.TypeGuards.isPropertyAccessExpression(expression)) {
			throw new TranspilerError(
				"Expected PropertyAccessExpression",
				node,
				TranspilerErrorType.ExpectedPropertyAccessExpression,
			);
		}
		this.validateApiAccess(expression.getNameNode());
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
			return `TS.array_${property}(${paramStr})`;
		}

		if (subExpType.isString() || subExpType.isStringLiteral()) {
			let paramStr = accessPath;
			if (params.length > 0) {
				paramStr += ", " + params;
			}
			if (STRING_MACRO_METHODS.indexOf(property) !== -1) {
				return `string.${property}(${paramStr})`;
			}
			return `TS.string_${property}(${paramStr})`;
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

			// for is a reserved word in Lua
			if (subExpTypeName === "SymbolConstructor") {
				if (property === "for") {
					return `${accessPath}.getFor(${params})`;
				}
			}

			if (subExpTypeName === "Map" || subExpTypeName === "ReadonlyMap" || subExpTypeName === "WeakMap") {
				let paramStr = accessPath;
				if (params.length > 0) {
					paramStr += ", " + params;
				}
				return `TS.map_${property}(${paramStr})`;
			}

			if (subExpTypeName === "Set" || subExpTypeName === "ReadonlySet" || subExpTypeName === "WeakSet") {
				let paramStr = accessPath;
				if (params.length > 0) {
					paramStr += ", " + params;
				}
				return `TS.set_${property}(${paramStr})`;
			}

			if (subExpTypeName === "ObjectConstructor") {
				return `TS.Object_${property}(${params})`;
			}

			const validateMathCall = () => {
				if (ts.TypeGuards.isExpressionStatement(node.getParent())) {
					throw new TranspilerError(
						`${subExpTypeName}.${property}() cannot be an expression statement!`,
						node,
						TranspilerErrorType.NoMacroMathExpressionStatement,
					);
				}
			};

			// custom math
			if (RBX_MATH_CLASSES.indexOf(subExpTypeName) !== -1) {
				switch (property) {
					case "add":
						validateMathCall();
						return `(${accessPath} + (${params}))`;
					case "sub":
						validateMathCall();
						return `(${accessPath} - (${params}))`;
					case "mul":
						validateMathCall();
						return `(${accessPath} * (${params}))`;
					case "div":
						validateMathCall();
						return `(${accessPath} / (${params}))`;
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

		let result = `${accessPath}${sep}${property}(${params})`;
		if (!doNotWrapTupleReturn && isTupleLike(node.getReturnType())) {
			result = `{ ${result} }`;
		}
		return result;
	}

	private transpileBinaryExpression(node: ts.BinaryExpression) {
		const opToken = node.getOperatorToken();
		const opKind = opToken.getKind();

		const lhs = node.getLeft();
		const rhs = node.getRight();
		let lhsStr: string;
		const rhsStr = this.transpileExpression(rhs);
		const statements = new Array<string>();

		function getOperandStr() {
			switch (opKind) {
				case ts.SyntaxKind.EqualsToken:
					return `${lhsStr} = ${rhsStr}`;
				/* Bitwise Operations */
				case ts.SyntaxKind.BarEqualsToken:
					const barExpStr = getLuaBarExpression(node, lhsStr, rhsStr);
					return `${lhsStr} = ${barExpStr}`;
				case ts.SyntaxKind.AmpersandEqualsToken:
					const ampersandExpStr = getLuaBitExpression(node, lhsStr, rhsStr, "and");
					return `${lhsStr} = ${ampersandExpStr}`;
				case ts.SyntaxKind.CaretEqualsToken:
					const caretExpStr = getLuaBitExpression(node, lhsStr, rhsStr, "xor");
					return `${lhsStr} = ${caretExpStr}`;
				case ts.SyntaxKind.LessThanLessThanEqualsToken:
					const lshExpStr = getLuaBitExpression(node, lhsStr, rhsStr, "lsh");
					return `${lhsStr} = ${lshExpStr}`;
				case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken:
					const rshExpStr = getLuaBitExpression(node, lhsStr, rhsStr, "rsh");
					return `${lhsStr} = ${rshExpStr}`;
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
			throw new TranspilerError("Unrecognized operation! #1", node, TranspilerErrorType.UnrecognizedOperation1);
		}

		if (
			opKind === ts.SyntaxKind.EqualsToken ||
			opKind === ts.SyntaxKind.BarEqualsToken ||
			opKind === ts.SyntaxKind.AmpersandEqualsToken ||
			opKind === ts.SyntaxKind.CaretEqualsToken ||
			opKind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
			opKind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
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
				throw new TranspilerError(
					"operator '==' is not supported! Use '===' instead.",
					opToken,
					TranspilerErrorType.NoEqualsEquals,
				);
			case ts.SyntaxKind.EqualsEqualsEqualsToken:
				return `${lhsStr} == ${rhsStr}`;
			case ts.SyntaxKind.ExclamationEqualsToken:
				throw new TranspilerError(
					"operator '!=' is not supported! Use '!==' instead.",
					opToken,
					TranspilerErrorType.NoExclamationEquals,
				);
			case ts.SyntaxKind.ExclamationEqualsEqualsToken:
				return `${lhsStr} ~= ${rhsStr}`;
			/* Bitwise Operations */
			case ts.SyntaxKind.BarToken:
				return getLuaBarExpression(node, lhsStr, rhsStr);
			case ts.SyntaxKind.AmpersandToken:
				return getLuaBitExpression(node, lhsStr, rhsStr, "and");
			case ts.SyntaxKind.CaretToken:
				return getLuaBitExpression(node, lhsStr, rhsStr, "xor");
			case ts.SyntaxKind.LessThanLessThanToken:
				return getLuaBitExpression(node, lhsStr, rhsStr, "lsh");
			case ts.SyntaxKind.GreaterThanGreaterThanToken:
				return getLuaBitExpression(node, lhsStr, rhsStr, "rsh");
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
				} else if (isRbxDataClassType(node.getRight().getType())) {
					return `(TS.typeof(${lhsStr}) == "${rhsStr}")`;
				} else {
					return `TS.instanceof(${lhsStr}, ${rhsStr})`;
				}
			default:
				const opKindName = node.getOperatorToken().getKindName();
				throw new TranspilerError(
					`Bad binary expression! (${opKindName})`,
					opToken,
					TranspilerErrorType.BadBinaryExpression,
				);
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
			throw new TranspilerError("Unrecognized operation! #2", node, TranspilerErrorType.UnrecognizedOperation2);
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
		throw new TranspilerError(
			`Bad prefix unary expression! (${tokenKind})`,
			node,
			TranspilerErrorType.BadPrefixUnaryExpression,
		);
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
			throw new TranspilerError("Unrecognized operation! #3", node, TranspilerErrorType.UnrecognizedOperation3);
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
		throw new TranspilerError(
			`Bad postfix unary expression! (${opKind})`,
			node,
			TranspilerErrorType.BadPostfixUnaryExpression,
		);
	}

	private transpileNewExpression(node: ts.NewExpression) {
		if (!node.getFirstChildByKind(ts.SyntaxKind.OpenParenToken)) {
			throw new TranspilerError(
				"Parentheses-less new expressions not allowed!",
				node,
				TranspilerErrorType.NoParentheseslessNewExpression,
			);
		}

		const expNode = node.getExpression();
		const expressionType = expNode.getType();
		let name = this.transpileExpression(expNode);
		const args = node.getArguments() as Array<ts.Expression>;
		const params = this.transpileArguments(args);

		if (inheritsFromRoact(expressionType)) {
			throw new TranspilerError(
				`Roact components cannot be created using new\n` +
					suggest(`Proper usage: Roact.createElement(${name}), <${name}></${name}> or </${name}>`),
				node,
				TranspilerErrorType.RoactNoNewComponentAllowed,
			);
		}

		if (RUNTIME_CLASSES.indexOf(name) !== -1) {
			name = `TS.${name}`;
		}

		if (expressionType.isObject()) {
			if (isRbxInstance(expNode)) {
				const nodeSymbol = expNode.getSymbol();
				const typeSymbol = expressionType.getSymbol();
				if (nodeSymbol && typeSymbol && nodeSymbol === typeSymbol) {
					const valueDec = nodeSymbol.getValueDeclaration();
					if (valueDec && ts.TypeGuards.isClassDeclaration(valueDec)) {
						const paramStr = params.length > 0 ? `, ${params}` : "";
						return `Instance.new("${name}"${paramStr})`;
					}
				}
			}

			if (inheritsFrom(expressionType, "ArrayConstructor")) {
				return "{}";
			}

			if (inheritsFrom(expressionType, "MapConstructor")) {
				if (args.length > 0) {
					return `TS.map_new(${params})`;
				} else {
					return "{}";
				}
			}

			if (inheritsFrom(expressionType, "SetConstructor")) {
				if (args.length > 0) {
					return `TS.set_new(${params})`;
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

	private getJSDocs(node: ts.Node) {
		const symbol = node.getSymbol();
		if (symbol) {
			const valDec = symbol.getValueDeclaration();
			if (valDec) {
				if (ts.TypeGuards.isPropertySignature(valDec) || ts.TypeGuards.isMethodSignature(valDec)) {
					return valDec.getJsDocs();
				}
			}
		}
		return [];
	}

	private hasDirective(node: ts.Node, directive: string) {
		for (const jsDoc of this.getJSDocs(node)) {
			if (
				jsDoc
					.getText()
					.split(" ")
					.indexOf(directive) !== -1
			) {
				return true;
			}
		}
		return false;
	}

	private validateApiAccess(node: ts.Node) {
		if (this.compiler.noHeuristics) {
			return;
		}
		if (this.scriptContext === ScriptContext.Server) {
			if (this.hasDirective(node, "@rbx-client")) {
				throw new TranspilerError(
					"Server script attempted to access a client-only API!",
					node,
					TranspilerErrorType.InvalidClientOnlyAPIAccess,
				);
			}
		} else if (this.scriptContext === ScriptContext.Client) {
			if (this.hasDirective(node, "@rbx-server")) {
				throw new TranspilerError(
					"Client script attempted to access a server-only API!",
					node,
					TranspilerErrorType.InvalidServerOnlyAPIAccess,
				);
			}
		}
	}

	private transpilePropertyAccessExpression(node: ts.PropertyAccessExpression) {
		const exp = node.getExpression();
		const expType = exp.getType();
		const expStr = this.transpileExpression(exp);
		const propertyStr = node.getName();

		this.validateApiAccess(node.getNameNode());

		if (ts.TypeGuards.isSuperExpression(exp)) {
			const baseClassName = exp
				.getType()
				.getSymbolOrThrow()
				.getName();
			const indexA = safeLuaIndex(`${baseClassName}._getters`, propertyStr);
			const indexB = safeLuaIndex("self", propertyStr);
			return `(${indexA} and function(self) return ${indexA}(self) end or function() return ${indexB} end)(self)`;
		}

		const symbol = exp.getType().getSymbol();
		if (symbol) {
			const valDec = symbol.getValueDeclaration();
			if (valDec) {
				if (
					ts.TypeGuards.isFunctionDeclaration(valDec) ||
					ts.TypeGuards.isArrowFunction(valDec) ||
					ts.TypeGuards.isFunctionExpression(valDec) ||
					ts.TypeGuards.isMethodDeclaration(valDec)
				) {
					throw new TranspilerError(
						"Cannot index a function value!",
						node,
						TranspilerErrorType.NoFunctionIndex,
					);
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
						throw new TranspilerError(
							"Class prototypes are not supported!",
							node,
							TranspilerErrorType.NoClassPrototype,
						);
					}
				}
			}
		}

		if (expType.isString() || expType.isStringLiteral() || expType.isArray()) {
			if (propertyStr === "length") {
				return `(#${expStr})`;
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
		const argExp = node.getArgumentExpressionOrThrow();

		let addOne = false;
		if (isTupleLike(expType) || expType.isArray()) {
			addOne = true;
		} else if (ts.TypeGuards.isCallExpression(expNode)) {
			const returnType = expNode.getReturnType();
			if (returnType.isArray() || isTupleLike(returnType)) {
				addOne = true;
			}
		} else if (expType.isIntersection()) {
			for (const intersectionType of expType.getIntersectionTypes()) {
				if (intersectionType.isArray()) {
					addOne = true;
					break;
				}
			}
		}

		let offset = "";
		let argExpStr: string;
		if (ts.TypeGuards.isNumericLiteral(argExp) && argExp.getText().indexOf("e") === -1) {
			let value = argExp.getLiteralValue();
			if (addOne) {
				value++;
			}
			argExpStr = value.toString();
		} else {
			if (addOne) {
				offset = " + 1";
			}
			argExpStr = this.transpileExpression(argExp) + offset;
		}

		if (ts.TypeGuards.isCallExpression(expNode) && isTupleLike(expNode.getReturnType())) {
			const expStr = this.transpileCallExpression(expNode, true);
			return `(select(${argExpStr}, ${expStr}))`;
		} else {
			const expStr = this.transpileExpression(expNode);
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
		const trueType = node.getWhenTrue().getType();
		if (trueType.isNullable() || trueType.isBoolean() || trueType.isBooleanLiteral()) {
			return `(${conditionStr} and function() return ${trueStr} end or function() return ${falseStr} end)()`;
		} else {
			return `(${conditionStr} and ${trueStr} or ${falseStr})`;
		}
	}

	private transpileTypeOfExpression(node: ts.TypeOfExpression) {
		const expStr = this.transpileExpression(node.getExpression());
		return `TS.typeof(${expStr})`;
	}

	private transpileSpreadElement(node: ts.SpreadElement) {
		const expStr = this.transpileExpression(node.getExpression());
		return `unpack(${expStr})`;
	}

	public transpileSourceFile(node: ts.SourceFile) {
		this.scriptContext = getScriptContext(node);
		const scriptType = getScriptType(node);

		let result = "";
		result += this.transpileStatementedNode(node);
		if (this.isModule) {
			if (!this.compiler.noHeuristics && scriptType !== ScriptType.Module) {
				throw new TranspilerError(
					"Attempted to export in a non-ModuleScript!",
					node,
					TranspilerErrorType.ExportInNonModuleScript,
				);
			}

			let HasExportEquals = false;

			for (const Descendant of node.getDescendantsOfKind(ts.SyntaxKind.ExportAssignment)) {
				if (HasExportEquals) {
					throw new TranspilerError(
						"ModuleScript contains multiple ExportEquals. You can only do `export = ` once.",
						node,
						TranspilerErrorType.MultipleExportEquals,
					);
				}
				if (Descendant.isExportEquals()) {
					HasExportEquals = true;
				}
			}

			if (HasExportEquals) {
				result = this.indent + `local _exports;\n` + result;
			} else {
				result = this.indent + `local _exports = {};\n` + result;
			}
			result += this.indent + "return _exports;\n";
		} else {
			if (!this.compiler.noHeuristics && scriptType === ScriptType.Module) {
				throw new TranspilerError(
					"ModuleScript contains no exports!",
					node,
					TranspilerErrorType.ModuleScriptContainsNoExports,
				);
			}
		}
		result =
			this.indent +
			`local TS = require(game:GetService("ReplicatedStorage").RobloxTS.Include.RuntimeLib);\n` +
			result;
		return result;
	}
}
