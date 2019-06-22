import * as ts from "ts-morph";
import { CompilerError, CompilerErrorType } from "./errors/CompilerError";
import { RojoProject } from "./RojoProject";
import { ProjectInfo } from "./types";
import { joinIndentedLines, ScriptContext } from "./utility";

export type PrecedingStatementContext = Array<string> & { isPushed: boolean };

export interface DeclarationContext {
	isIdentifier: boolean;
	needsLocalizing?: boolean;
	set: string;
}

function canBePushedToReusableId(node: ts.Node): boolean {
	if (
		ts.TypeGuards.isThisExpression(node) ||
		ts.TypeGuards.isIdentifier(node) ||
		ts.TypeGuards.isSuperExpression(node)
	) {
		return true;
	} else if (ts.TypeGuards.isPrefixUnaryExpression(node) || ts.TypeGuards.isPostfixUnaryExpression(node)) {
		return canBePushedToReusableId(node.getOperand());
	} else if (ts.TypeGuards.isPropertyAccessExpression(node)) {
		return canBePushedToReusableId(node.getNameNode());
	} else if (ts.TypeGuards.isElementAccessExpression(node)) {
		return canBePushedToReusableId(node.getArgumentExpressionOrThrow());
	} else {
		return false;
	}
}

export class CompilerState {
	constructor(
		public readonly rootDirPath: string,
		public readonly outDirPath: string,
		public readonly projectInfo: ProjectInfo,
		public readonly rojoProject?: RojoProject,
		public readonly modulesDir?: ts.Directory,
		public readonly runtimeOverride?: string,
	) {}
	public declarationContext = new Map<ts.Node, DeclarationContext>();

	public pushToDeclarationOrNewId(
		node: ts.Node,
		expStr: string,
		condition: (declaration: DeclarationContext) => boolean = dec => dec.set !== "return",
	) {
		const declaration = this.declarationContext.get(node);
		let id: string;
		const isReturn = declaration && declaration.set === "return";

		if (declaration && condition(declaration)) {
			this.declarationContext.delete(node);
			({ set: id } = declaration);

			const context = this.getCurrentPrecedingStatementContext(node);

			context.push(
				this.indent +
					`${declaration.needsLocalizing ? "local " : ""}${id}${
						expStr ? ` ${isReturn ? "" : "= "}${expStr}` : ""
					};\n`,
			);

			context.isPushed = declaration.isIdentifier;
		} else {
			id = this.pushPrecedingStatementToReuseableId(node, expStr);
		}

		return id;
	}

	public currentConditionalContext: string = "";
	private precedingStatementContexts = new Array<PrecedingStatementContext>();

	public getCurrentPrecedingStatementContext(node: ts.Node) {
		const currentContext = this.precedingStatementContexts[this.precedingStatementContexts.length - 1] as
			| PrecedingStatementContext
			| undefined;

		if (!currentContext) {
			const kind = node.getKindName();
			const ancestorName = node
				.getAncestors()
				.find(ancestor => ts.TypeGuards.isStatement(ancestor) || ts.TypeGuards.isStatementedNode(ancestor))!
				.getKindName();
			throw new CompilerError(
				`roblox-ts does not support using a ${kind} which requires preceding statements in a ${ancestorName}.`,
				node,
				CompilerErrorType.BadExpression,
				true,
			);
		}

		return currentContext;
	}

	public enterPrecedingStatementContext(newContext = new Array<string>()) {
		(newContext as PrecedingStatementContext).isPushed = false;
		this.precedingStatementContexts.push(newContext as PrecedingStatementContext);
		return newContext as PrecedingStatementContext;
	}

	public exitPrecedingStatementContext() {
		return this.precedingStatementContexts.pop()!;
	}

	public exitPrecedingStatementContextAndJoin(numTabs: number = 0) {
		return joinIndentedLines(this.exitPrecedingStatementContext(), numTabs);
	}

	public pushPrecedingStatements(node: ts.Node, ...statements: Array<string>) {
		const context = this.getCurrentPrecedingStatementContext(node);
		context.isPushed = false;
		return context.push(...statements);
	}

	public pushPrecedingStatementToNewId(node: ts.Node, compiledSource: string, newId = this.getNewId()) {
		const currentContext = this.getCurrentPrecedingStatementContext(node);
		currentContext.push(this.indent + `local ${newId}${compiledSource ? ` = ${compiledSource}` : ""};\n`);
		currentContext.isPushed = true;
		return newId;
	}

	public pushPrecedingStatementToReuseableId(node: ts.Node, compiledSource: string, nextCachedStrs?: Array<string>) {
		if (compiledSource === "" || !canBePushedToReusableId(node)) {
			return this.pushPrecedingStatementToNewId(node, compiledSource);
		}

		/** Gets the top PreStatement to compare to */
		let previousTop: Array<string> | undefined;

		for (let i = this.precedingStatementContexts.length - 1; 0 <= i; i--) {
			const context = this.precedingStatementContexts[i];
			const topPreStatement = context[context.length - 1];
			if (topPreStatement) {
				previousTop = [...context].reverse();
				break;
			}
		}

		for (const cache of [previousTop, nextCachedStrs]) {
			/** If we would write a duplicate `local _5 = i`, skip it */
			if (cache) {
				for (const str of cache) {
					const matchesRegex = str.match(/^(\t*)local ([a-zA-Z_][a-zA-Z0-9_]*) = ([^;]+);\n$/);
					// iterate only through non-state changing pushed id statements
					if (!matchesRegex) {
						break;
					}
					const [, indentation, currentId, data] = matchesRegex;
					if (indentation === this.indent && data === compiledSource) {
						this.getCurrentPrecedingStatementContext(node).isPushed = true;
						return currentId;
					}
				}
			}
		}

		return this.pushPrecedingStatementToNewId(node, compiledSource);
	}

	// indent
	public indent = "";

	public pushIndent() {
		this.indent += "\t";
	}

	public popIndent() {
		this.indent = this.indent.substr(1);
	}

	// id stack
	public idStack = new Array<number>();

	public pushIdStack() {
		this.idStack.push(0);
	}

	public popIdStack() {
		this.idStack.pop();
	}

	public getNewId() {
		const sum = this.idStack.reduce((accum, value) => accum + value);
		this.idStack[this.idStack.length - 1]++;
		return `_${sum}`;
	}

	// hoist stack
	public hoistStack = new Array<Set<string>>();

	public pushHoistStack(name: string) {
		this.hoistStack[this.hoistStack.length - 1].add(name);
	}

	public popHoistStack(result: string) {
		const top = this.hoistStack.pop();
		if (top) {
			const hoists = [...top];
			const namedHoists = new Array<string>();
			const declareHoists = new Array<string>();
			hoists.forEach(v => (v.includes("=") ? declareHoists : namedHoists).push(v));

			if (namedHoists && namedHoists.length > 0) {
				result = this.indent + `local ${namedHoists.join(", ")};\n` + result;
			}

			if (declareHoists && declareHoists.length > 0) {
				result = this.indent + `${declareHoists.join(";\n" + this.indent)};\n` + result;
			}
		}
		return result;
	}

	// export stack
	public exportStack = new Array<Set<string>>();

	public pushExport(name: string, node: ts.Node & ts.ExportableNode) {
		if (!node.hasExportKeyword()) {
			return;
		}

		const ancestorName = this.getExportContextName(node);
		const alias = node.hasDefaultKeyword() ? "_default" : name;
		this.exportStack[this.exportStack.length - 1].add(`${ancestorName}.${alias} = ${name};\n`);
	}

	public getNameForContext(myNamespace: ts.NamespaceDeclaration | undefined): string {
		let name;

		if (myNamespace) {
			name = myNamespace.getName();
			name = this.namespaceStack.get(name) || name;
		} else {
			name = "_exports";
			this.isModule = true;
		}

		return name;
	}

	public getExportContextName(node: ts.VariableStatement | ts.Node): string {
		return this.getNameForContext(node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration));
	}

	// in the form: { ORIGINAL_IDENTIFIER = REPLACEMENT_VALUE }
	// For example, this is used for  exported/namespace values
	// which should be represented differently in Lua than they
	// can be represented in TS
	public variableAliases = new Map<string, string>();

	public getAlias(name: string) {
		const alias = this.variableAliases.get(name);
		if (alias !== undefined) {
			return alias;
		} else {
			return name;
		}
	}

	public namespaceStack = new Map<string, string>();
	public continueId = -1;
	public isModule = false;
	public scriptContext = ScriptContext.None;
	public roactIndent: number = 0;
	public hasRoactImport: boolean = false;
	public usesTSLibrary = false;
}
