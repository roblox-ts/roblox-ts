import _storage from "node-persist";
import os from "os";
import path from "path";
import ua from "universal-analytics";
import uuid from "uuid/v4";

const GA_ID = "UA-144588796-1";

let storageInitialized = false;
async function getStorage() {
	if (!storageInitialized) {
		await _storage.init({
			dir: path.join(os.homedir(), ".roblox-ts"),
		});
		storageInitialized = true;
	}
	return _storage;
}

let userId: string | undefined;
async function getUserId() {
	if (userId === undefined) {
		const storage = await getStorage();
		const storedId = (await storage.getItem("userId")) as string | undefined;
		if (storedId) {
			userId = storedId;
		} else {
			userId = uuid();
			await storage.setItem("userId", userId);
		}
	}
	return userId;
}

let analyticsDisabled: boolean | undefined;

export async function setAnalyticsDisabled(disabled: boolean) {
	analyticsDisabled = disabled;
	const storage = await getStorage();
	await storage.setItem("no-analytics", disabled);
	if (disabled) {
		console.log("Analytics disabled");
	} else {
		console.log("Analytics enabled");
	}
}

async function getAnalyticsDisabled() {
	if (process.env.CI) {
		return true;
	}
	if (analyticsDisabled === undefined) {
		const storage = await getStorage();
		analyticsDisabled = (await storage.getItem("no-analytics")) === true;
	}
	return analyticsDisabled;
}

let uaVisitor: ua.Visitor | undefined;
async function getVisitor() {
	if (!uaVisitor && !(await getAnalyticsDisabled())) {
		uaVisitor = ua(GA_ID, await getUserId());
	}
	return uaVisitor;
}

export async function addEvent(category: string, message: string) {
	const visitor = await getVisitor();
	if (visitor) {
		visitor.event(category, message).send();
	}
}
