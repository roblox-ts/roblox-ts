import Roact from "rbx-roact";

class FailedRoactClass extends Roact.Component {
	public get getter() {
		return 10;
	}

	public render(): Roact.Element {
		return <frame/>;
	}
}
