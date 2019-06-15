import Roact from "@rbxts/roact";

class RoactClass extends Roact.Component {
	public render(): Roact.Element {
		return <frame />;
	}
}

class FailedRoactSubClass extends RoactClass {}
export {};
