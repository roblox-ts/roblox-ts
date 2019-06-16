import Roact from "@rbxts/roact";

class FailedRoactClass extends Roact.Component {
	public set setter(value: number) {}

	public render(): Roact.Element {
		return <frame />;
	}
}
export {};
