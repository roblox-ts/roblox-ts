import Roact from "@rbxts/roact";

const RoactModule = game
	.GetService("ReplicatedStorage")
	.WaitForChild("include")
	.WaitForChild("node_modules")
	.WaitForChild("roact")
	.WaitForChild("roact")
	.WaitForChild("src") as ModuleScript;

export declare interface ElementKind {
	Portal: symbol;
	Host: symbol;
	Function: symbol;
	Stateful: symbol;
	Fragment: symbol;
	of: (value: unknown) => boolean;
}
export const ElementKind = require(RoactModule.WaitForChild("ElementKind") as ModuleScript) as ElementKind;

export declare interface Type {
	Binding: symbol;
	Element: symbol;
	HostChangeEvent: symbol;
	HostEvent: symbol;
	StatefulComponentClass: symbol;
	VirtualNode: symbol;
	VirtualTree: symbol;
	of: (value: unknown) => boolean;
}
export const Type = require(RoactModule.WaitForChild("Type") as ModuleScript) as Type;

export type ExplicitProps<P = {}> = Partial<P> & {
	[Roact.Children]: { [name: string]: Roact.Element | undefined };
};
export interface FragmentLike {
	elements: { [name: string]: unknown };
}
export type Template<T extends Instance> = Partial<WritableInstanceProperties<T>>;
