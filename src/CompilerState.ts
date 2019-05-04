import * as ts from "ts-morph";
import { CompilerError, CompilerErrorType } from "./errors/CompilerError";
import { joinIndentedLines, removeBalancedParenthesisFromStringBorders, ScriptContext } from "./utility";

interface Partition {
	dir: ts.Directory;
	target: string;
}

export type PrecedingStatementContext = Array<string> & { isPushed: boolean };

export class CompilerState {
	constructor(public readonly syncInfo: Array<Partition>, public readonly modulesDir?: ts.Directory) {}

	public currentConditionalContext: string = "";
	private precedingStatementContexts = new Array<PrecedingStatementContext>();

	public getCurrentPrecedingStatementContext(node: ts.Node) {
		const currentContext = this.precedingStatementContexts[this.precedingStatementContexts.length - 1] as
			| PrecedingStatementContext
			| undefined;

		if (!currentContext) {
			const kind = node.getKindName();

			throw new CompilerError(
				`roblox-ts accidentally does not support using a ${kind} which requires preceding statements in a ${node
					.getAncestors()
					.find(ancestor => ts.TypeGuards.isStatement(ancestor))!
					.getKindName()}.` +
					" Please submit an issue report to https://github.com/roblox-ts/roblox-ts/issues",
				node,
				CompilerErrorType.BadExpression,
			);
		}

		return currentContext;
	}

	public currentPrecedingStatementContextHasStatements(node: ts.Node) {
		return this.getCurrentPrecedingStatementContext(node).length > 0;
	}

	public enterPrecedingStatementContext() {
		const newContext = new Array<string>() as PrecedingStatementContext;
		newContext.isPushed = false;
		// console.log("context:", this.precedingStatementContexts.length + 1, this.precedingStatementContexts);
		return this.precedingStatementContexts.push(newContext as PrecedingStatementContext);
	}

	public exitPrecedingStatementContext() {
		// console.log("context:", this.precedingStatementContexts.length - 1, this.precedingStatementContexts);
		return this.precedingStatementContexts.pop()!;
	}

	public exitPrecedingStatementContextAndJoin(numTabs: number = 0) {
		return joinIndentedLines(this.exitPrecedingStatementContext(), numTabs);
	}

	public pushPrecedingStatements(node: ts.Node, ...statements: Array<string>) {
		this.getCurrentPrecedingStatementContext(node).isPushed = false;
		return this.getCurrentPrecedingStatementContext(node).push(...statements);
	}

	public pushPrecedingStatementToNewIds(node: ts.Node, statement: string, numIds: number) {
		const newIds = new Array<string>();
		for (let i = 0; i < numIds; i++) {
			newIds[i] = this.getNewId();
		}
		this.pushPrecedingStatements(node, this.indent + `local ${newIds.join(", ")} = ${statement};\n`);
		return newIds;
	}

	public pushPrecedingStatementToNextId(node: ts.Node, transpiledSource: string, nextCachedStrs?: Array<string>) {
		/** Gets the top PreStatement to compare to */
		transpiledSource = removeBalancedParenthesisFromStringBorders(transpiledSource);
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
					const matchesRegex = str.match(/^(\t*)local (_\d+) = ([^;]+);\n$/);
					// iterate only through non-state changing pushed id statements
					if (!matchesRegex) {
						break;
					}
					const [, indentation, currentId, data] = matchesRegex;
					if (indentation === this.indent && data === transpiledSource) {
						return currentId;
					}
				}
			}
		}

		const newId = this.getNewId();
		this.pushPrecedingStatements(node, this.indent + `local ${newId} = ${transpiledSource};\n`);
		return newId;
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
