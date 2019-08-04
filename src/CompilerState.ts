import * as ts from "ts-morph";
import { ProjectType } from ".";
import { CompilerError, CompilerErrorType } from "./errors/CompilerError";
import { RojoProject } from "./RojoProject";
import { joinIndentedLines, removeBalancedParenthesisFromStringBorders, ScriptContext } from "./utility/general";

export type PrecedingStatementContext = Array<string> & { isPushed: boolean };

export interface DeclarationContext {
	isIdentifier: boolean;
	needsLocalizing?: boolean;
	set: string;
}

export class CompilerState {
	constructor(
		public readonly rootPath: string,
		public readonly outPath: string,
		public readonly projectType: ProjectType,
		public readonly runtimeLibPath: Array<string>,
		public readonly modulesPath: string,
		public readonly rojoProject?: RojoProject,
		public readonly runtimeOverride?: string,
		public readonly logTruthyDifferences?: boolean,
	) {}
	public declarationContext = new Map<ts.Node, DeclarationContext>();
	public alreadyCheckedTruthyConditionals = new Array<ts.Node>();

	public pushToDeclarationOrNewId(
		node: ts.Node,
		expStr: string,
		condition: (declaration: DeclarationContext) => boolean = dec => dec.set !== "return",
		newId?: string,
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
			id = this.pushPrecedingStatementToNewId(node, expStr, newId);
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
		compiledSource = removeBalancedParenthesisFromStringBorders(compiledSource);
		const currentContext = this.getCurrentPrecedingStatementContext(node);
		currentContext.push(this.indent + `local ${newId}${compiledSource ? ` = ${compiledSource}` : ""};\n`);
		currentContext.isPushed = true;
		return newId;
	}

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
		const alias = node.hasDefaultKeyword() ? "default" : name;
		this.exportStack[this.exportStack.length - 1].add(`${ancestorName}.${alias} = ${name};\n`);
	}

	public getNameForContext(myNamespace: ts.NamespaceDeclaration | undefined): string {
		let name;

		if (myNamespace) {
			name = myNamespace.getName();
			name = this.namespaceStack.get(name) || name;
		} else {
			name = "exports";
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
