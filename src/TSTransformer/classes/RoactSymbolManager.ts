import ts from "byots";
import fs from "fs-extra";
import path from "path";
import { ProjectError } from "Shared/errors/ProjectError";
import { findFirstChild } from "TSTransformer/util/traversal";

const COMPONENT_CLASS_NAME = "Component";
const PURE_COMPONENT_CLASS_NAME = "PureComponent";

export class RoactSymbolManager {
	public readonly componentSymbol: ts.Symbol;
	public readonly pureComponentSymbol: ts.Symbol;

	constructor(program: ts.Program, typeChecker: ts.TypeChecker, nodeModulesPath: string) {
		// only continue if @rbxts/roact exists
		const roactPackagePath = path.join(nodeModulesPath, "roact", "index.d.ts");
		if (!fs.pathExistsSync(roactPackagePath)) {
			const noneSymbol = typeChecker.createSymbol(ts.SymbolFlags.None, "None" as ts.__String);
			this.componentSymbol = noneSymbol;
			this.pureComponentSymbol = noneSymbol;
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

		for (const statement of roactNamespace.body.statements) {
			if (ts.isClassDeclaration(statement) && statement.name) {
				if (statement.name.text === COMPONENT_CLASS_NAME) {
					componentSymbol = typeChecker.getSymbolAtLocation(statement.name);
				} else if (statement.name.text === PURE_COMPONENT_CLASS_NAME) {
					pureComponentSymbol = typeChecker.getSymbolAtLocation(statement.name);
				}
			}
			if (componentSymbol && pureComponentSymbol) {
				break;
			}
		}

		if (!componentSymbol) {
			throw new ProjectError(`RoactSymbolManager could not symbol for Roact.Component`);
		}

		if (!pureComponentSymbol) {
			throw new ProjectError(`RoactSymbolManager could not symbol for Roact.PureComponent`);
		}

		this.componentSymbol = componentSymbol;
		this.pureComponentSymbol = pureComponentSymbol;
	}
}
