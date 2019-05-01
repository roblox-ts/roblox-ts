import * as ts from "ts-morph";
import { ScriptContext } from "./utility";

interface Partition {
	dir: ts.Directory;
	target: string;
}

export class CompilerState {
	constructor(public readonly syncInfo: Array<Partition>, public readonly modulesDir?: ts.Directory) {}

	public currentConditionalContext: string = "";
	private precedingStatementContexts = new Array<Array<string>>();

	public enterPrecedingStatementContext() {
		const newContext = new Array<string>();
		return this.precedingStatementContexts.push(newContext);
	}

	public exitPrecedingStatementContextAndJoin(numTabs: number = 0) {
		const sep = "\t".repeat(numTabs);
		return sep + this.precedingStatementContexts.pop()!.join(sep);
	}

	// public getOptimizedPrecedingStr(
	// 	transpiledSource: string,
	// 	context: Array<string> = this.precedingStatementContexts[this.precedingStatementContexts.length - 1],
	// ) {
	// 	if (context && context.length > 0) {
	// 		const top = context[context.length - 1];
	// 		const matchesRegex = top.match(/^(\t*)local (_\d+) = ([^;]+);\n$/);
	// 		if (matchesRegex) {
	// 			const [, indentation, currentId, data] = matchesRegex;
	// 			if (indentation === this.indent && currentId === transpiledSource) {
	// 				context.pop();
	// 				return data;
	// 			}
	// 		}
	// 	}

	// 	return transpiledSource;
	// }

	public currentPrecedingStatementContextHasStatements() {
		return this.precedingStatementContexts[this.precedingStatementContexts.length - 1].length > 0;
	}

	public pushPrecedingStatements(...statements: Array<string>) {
		this.precedingStatementContexts[this.precedingStatementContexts.length - 1].push(...statements);
	}

	public exitPrecedingStatementContext() {
		return this.precedingStatementContexts.pop()!;
	}

	public pushPrecedingStatementToNextId(transpiledSource: string, nextCachedStrs?: Array<string>) {
		/** Gets the top PreStatement to compare to */
		let previousTop: string | undefined;

		for (let i = this.precedingStatementContexts.length - 1; 0 <= i; i--) {
			const context = this.precedingStatementContexts[i];
			const topPreStatement = context[context.length - 1];
			if (topPreStatement) {
				previousTop = topPreStatement;
				break;
			}
		}

		for (const top of [previousTop, nextCachedStrs ? nextCachedStrs[0] : undefined]) {
			/** If we would write a duplicate `local _5 = i`, skip it */
			if (top) {
				const matchesRegex = top.match(/^(\t*)local (_\d+) = ([^;]+);\n$/);
				if (matchesRegex) {
					const [, indentation, currentId, data] = matchesRegex;
					if (indentation === this.indent && data === transpiledSource) {
						return currentId;
					}
				}
			}
		}

		const newId = this.getNewId();
		this.pushPrecedingStatements(this.indent + `local ${newId} = ${transpiledSource};\n`);
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
