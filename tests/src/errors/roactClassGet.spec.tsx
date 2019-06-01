import Roact from "@rbxts/roact";

class FailedRoactClass extends Roact.Component {
	public get getter() {
		return 10;
	}

	public render(): Roact.Element {
		return <frame/>;
	}
}
