import ts from "byots";
import fs from "fs-extra";
import path from "path";
import { ProjectError } from "Shared/errors/ProjectError";
import { findFirstChild } from "TSTransformer/util/traversal";

const COMPONENT_CLASS_NAME = "Component";
const PURE_COMPONENT_CLASS_NAME = "PureComponent";
const FRAGMENT_NAME = "Fragment";

export class RoactSymbolManager {
	public readonly componentSymbol: ts.Symbol;
	public readonly pureComponentSymbol: ts.Symbol;
	public readonly fragmentSymbol: ts.Symbol;

	constructor(program: ts.Program, typeChecker: ts.TypeChecker, nodeModulesPath: string) {
		// only continue if @rbxts/roact exists
		const roactPackagePath = path.join(nodeModulesPath, "roact", "index.d.ts");
		if (!fs.pathExistsSync(roactPackagePath)) {
			const noneSymbol = typeChecker.createSymbol(ts.SymbolFlags.None, "None" as ts.__String);
			this.componentSymbol = noneSymbol;
			this.pureComponentSymbol = noneSymbol;
			this.fragmentSymbol = noneSymbol;
			return;
		}

		const sourceFile = program.getSourceFile(roactPackagePath);
		if (!sourceFile) {
			throw new ProjectError(`RoactSymbolManager could not find source file for ${roactPackagePath}`);
		}

		const roactNamespace = findFirstChild(sourceFile.statements, ts.isModuleDeclaration);
		if (!roactNamespace || !roactNamespace.body || !ts.isModuleBlock(roactNamespace.body)) {
			throw new ProjectError(`RoactSymbolManager could not find Roact namespace`);
		}

		let componentSymbol: ts.Symbol | undefined;
		let pureComponentSymbol: ts.Symbol | undefined;
		let fragmentSymbol: ts.Symbol | undefined;

		for (const statement of roactNamespace.body.statements) {
			if (ts.isClassDeclaration(statement) && statement.name) {
				if (statement.name.text === COMPONENT_CLASS_NAME) {
					componentSymbol = typeChecker.getSymbolAtLocation(statement.name);
				} else if (statement.name.text === PURE_COMPONENT_CLASS_NAME) {
					pureComponentSymbol = typeChecker.getSymbolAtLocation(statement.name);
				}
			} else if (ts.isVariableStatement(statement)) {
				const dec = statement.declarationList.declarations[0];
				if (ts.isIdentifier(dec.name) && dec.name.text === FRAGMENT_NAME) {
					fragmentSymbol = typeChecker.getSymbolAtLocation(dec.name);
				}
			}
			if (componentSymbol && pureComponentSymbol && fragmentSymbol) {
				break;
			}
		}

		if (!componentSymbol) {
			throw new ProjectError(`RoactSymbolManager could not symbol for Roact.Component`);
		}

		if (!pureComponentSymbol) {
			throw new ProjectError(`RoactSymbolManager could not symbol for Roact.PureComponent`);
		}

		if (!fragmentSymbol) {
			throw new ProjectError(`RoactSymbolManager could not symbol for Roact.Fragment`);
		}

		this.componentSymbol = componentSymbol;
		this.pureComponentSymbol = pureComponentSymbol;
		this.fragmentSymbol = fragmentSymbol;
	}
}
