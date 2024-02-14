import kleur from "kleur";

const REPO_URL = "https://github.com/roblox-ts/roblox-ts";

export function issue(id: number) {
	return "More information: " + kleur.grey(`${REPO_URL}/issues/${id}`);
}
