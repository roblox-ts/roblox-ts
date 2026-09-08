import fs from "fs-extra";
import path from "path";

import { ReferenceFixture } from "./referenceFixture";

export const CONTENT_COUNT = 32;

// keep the systems handwritten and scale the content, as a game grows its items and encounters
export function createRepresentativeProject(fixture: ReferenceFixture, incremental = true) {
	const graph: Record<string, Array<string>> = {
		core: [],
		catalog: ["core"],
		inventory: ["core", "catalog"],
		combat: ["core", "catalog"],
		world: ["core", "catalog"],
		presentation: ["inventory", "combat", "world"],
		server: ["inventory", "combat", "world"],
		game: ["presentation", "server"],
	};

	for (const [name, references] of Object.entries(graph)) {
		fixture.project(name, references, {
			incremental: name === "game" ? incremental : true,
			declaration: true,
			declarationMap: true,
			declarationDir: `../types/${name}`,
			tsBuildInfoFile: name !== "game" || incremental ? `../cache/${name}.tsbuildinfo` : undefined,
		});
	}

	fixture.write(
		"core/src/types.ts",
		`
export interface Item { id: number; power: number; label: string; }
export interface Enemy { id: number; health: number; reward: number; }
export interface Biome { id: number; multiplier: number; enemies: ReadonlyArray<number>; }
export interface PlayerState { health: number; coins: number; inventory: Array<Item>; }
export type Outcome = { kind: "won"; reward: number } | { kind: "lost"; remaining: number };
`,
	);
	fixture.write(
		"core/src/math.ts",
		`
export function scale(value: number, multiplier: number) { return value * multiplier; }
export function clamp(value: number, minimum: number, maximum: number) {
	return math.max(minimum, math.min(maximum, value));
}
`,
	);
	fixture.write(
		"core/src/signal.ts",
		`
export class Signal<T> {
	private listeners = new Set<(value: T) => void>();
	public connect(listener: (value: T) => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	public fire(value: T) {
		for (const listener of this.listeners) { listener(value); }
	}
}
`,
	);
	fixture.write(
		"core/src/index.ts",
		`
export type { Item, Enemy, Biome, PlayerState, Outcome } from "./types";
export { scale, clamp } from "./math";
export { Signal } from "./signal";
`,
	);

	for (const kind of ["items", "enemies", "biomes"]) {
		const imports = new Array<string>();
		const names = new Array<string>();
		for (let index = 0; index < CONTENT_COUNT; index++) {
			const name = `entry${index}`;
			const type = kind === "items" ? "Item" : kind === "enemies" ? "Enemy" : "Biome";
			const fields =
				kind === "items"
					? `power: ${index + 1}, label: "Item ${index}"`
					: kind === "enemies"
						? `health: ${index + 2}, reward: ${index + 3}`
						: `multiplier: ${(index % 3) + 1}, enemies: [${index}]`;
			fixture.write(
				`catalog/src/${kind}/${name}.ts`,
				`
import type { ${type} } from "../../../core/src";
export const ${name}: ${type} = { id: ${index}, ${fields} };
`,
			);
			imports.push(`import { ${name} } from "./${name}";`);
			names.push(name);
		}
		fixture.write(
			`catalog/src/${kind}/index.ts`,
			`${imports.join("\n")}\nexport const ${kind} = [${names.join(", ")}];`,
		);
	}
	fixture.write(
		"catalog/src/index.ts",
		`
export { items } from "./items";
export { enemies } from "./enemies";
export { biomes } from "./biomes";
`,
	);
	fixture.write(
		"inventory/src/index.ts",
		`
import { items } from "../../catalog/src";
import { Signal } from "../../core/src";
import type { Item } from "../../core/src";
export class Inventory {
	private counts = new Map<number, number>();
	public readonly changed = new Signal<number>();
	public add(item: Item, count = 1) {
		this.counts.set(item.id, (this.counts.get(item.id) ?? 0) + count);
		this.changed.fire(item.id);
	}
	public power() {
		let result = 0;
		for (const [id, count] of this.counts) { result += items[id].power * count; }
		return result;
	}
	public snapshot() { return [...this.counts].map(([id, count]) => ({ id, count })); }
}
export function startingInventory() {
	const inventory = new Inventory();
	inventory.add(items[0], 4);
	return inventory;
}
`,
	);
	fixture.write(
		"combat/src/index.ts",
		`
import { enemies } from "../../catalog/src";
import { clamp } from "../../core/src";
import type { Outcome } from "../../core/src";
export function fight(enemyId: number, power: number): Outcome {
	const enemy = enemies[enemyId];
	const remaining = clamp(enemy.health - power, 0, enemy.health);
	return remaining === 0 ? { kind: "won", reward: enemy.reward } : { kind: "lost", remaining };
}
`,
	);
	fixture.write(
		"world/src/index.ts",
		`
import { biomes } from "../../catalog/src";
import { scale } from "../../core/src";
export function encounters(biomeId: number) { return [...biomes[biomeId].enemies]; }
export function reward(biomeId: number, value: number) { return scale(value, biomes[biomeId].multiplier); }
`,
	);
	fixture.write(
		"presentation/src/index.ts",
		`
import type { Inventory } from "../../inventory/src";
import { fight } from "../../combat/src";
import { encounters } from "../../world/src";
export function preview(inventory: Inventory, biomeId: number) {
	return encounters(biomeId).map(id => {
		const outcome = fight(id, inventory.power());
		return outcome.kind === "won" ? "Reward: " + outcome.reward : "Remaining: " + outcome.remaining;
	});
}
`,
	);
	fixture.write(
		"server/src/index.ts",
		`
import { startingInventory } from "../../inventory/src";
import { fight } from "../../combat/src";
import { encounters, reward } from "../../world/src";
export function campaign(biomeId: number) {
	const inventory = startingInventory();
	let coins = 0;
	for (const enemy of encounters(biomeId)) {
		const outcome = fight(enemy, inventory.power());
		if (outcome.kind === "won") { coins += reward(biomeId, outcome.reward); }
	}
	return { coins, inventory };
}
`,
	);
	fixture.write(
		"game/src/index.ts",
		`
import { preview } from "../../presentation/src";
import { campaign } from "../../server/src";
export function run() {
	const result = campaign(0);
	assert(result.coins === 3, "campaign reward");
	assert(preview(result.inventory, 0)[0] === "Reward: 3", "presentation agrees with server");
	let events = 0;
	const disconnect = result.inventory.changed.connect(() => events++);
	result.inventory.changed.fire(0);
	disconnect();
	result.inventory.changed.fire(0);
	assert(events === 1, "cross-project class and callback identity");
	assert(result.inventory.snapshot()[0].count === 4, "map and tuple iteration");
}
`,
	);
	fixture.write("main.server.luau", 'require(script.Parent.game).run()\nprint("representative game passed")\n');
	fixture.write("world/src/weather.luau", "return { weather = 'clear' }\n");
	fixture.write("world/src/settings.json", '{ "fog": 100 }\n');

	const rojo = fs.readJsonSync(fixture.file("default.project.json"));
	delete rojo.tree.ReplicatedStorage.game;
	delete rojo.tree.ReplicatedStorage.server;
	rojo.tree.ServerScriptService = {
		$className: "ServerScriptService",
		main: { $path: "main.server.luau" },
		game: { $path: "out/game" },
		server: { $path: "out/server" },
	};
	fixture.json("default.project.json", rojo);
}

// compare deployable artifacts and declarations; build info contains cache and absolute-path bookkeeping
export function readRepresentativeOutputs(fixture: ReferenceFixture) {
	const files: Record<string, string> = {};
	const visit = (directory: string) => {
		if (!fs.existsSync(fixture.file(directory))) {
			return;
		}
		for (const entry of fs.readdirSync(fixture.file(directory), { withFileTypes: true })) {
			const relative = path.posix.join(directory, entry.name);
			if (entry.isDirectory()) {
				visit(relative);
			} else {
				files[relative] = fs.readFileSync(fixture.file(relative), "utf8");
			}
		}
	};
	for (const directory of ["out", "types", "include"]) {
		visit(directory);
	}
	return files;
}

export function copyRepresentativeSources(from: ReferenceFixture, to: ReferenceFixture) {
	for (const entry of fs.readdirSync(from.directory)) {
		if (!["node_modules", "out", "types", "cache", "include"].includes(entry)) {
			fs.copySync(from.file(entry), to.file(entry));
		}
	}
}
