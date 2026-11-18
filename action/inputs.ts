// What both Actions read from the workflow: their inputs, the model the developer connected, and how they
// hand results back. The review (action/main.ts) and the voice pipe (voice/main.ts) share all of it.
import { appendFileSync } from "node:fs";
import { DEFAULT_MODEL, model as makeModel, providerOf, type Model, type Provider } from "./models.ts";
import { humourOf } from "./voice.ts";

export const input = (name: string) => (process.env[`INPUT_${name.toUpperCase()}`] ?? "").trim();

export function flag(name: string, fallback: boolean): boolean {
	const v = input(name).toLowerCase();
	if (v === "") return fallback;
	if (v === "true" || v === "false") return v === "true";
	throw new Error(`${name} must be true or false, not "${v}".`);
}

/** A step output, written so a value that runs over several lines arrives whole. */
export function output(name: string, value: string) {
	if (!process.env.GITHUB_OUTPUT) return;
	let mark = "SILVERTONGUE_EOF";
	while (value.includes(mark)) mark += "_";
	appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${mark}\n${value}\n${mark}\n`);
}

// A Claude subscription comes first when it is given: it means no API bill.
const KEYS: [Provider, string][] = [["claude-code", "claude-code-oauth-token"], ["anthropic", "anthropic-api-key"], ["openai", "openai-api-key"], ["gemini", "gemini-api-key"]];

export function chooseModel(): Model {
	const keys = Object.fromEntries(KEYS.map(([p, name]) => [p, input(name)])) as Record<Provider, string>;
	const named = input("model");
	let provider = named ? providerOf(named) : KEYS.map(([p]) => p).find((p) => keys[p]);
	if (named && !provider) throw new Error(`model "${named}" is not a Claude, OpenAI or Gemini model id.`);
	if (provider === "anthropic" && keys["claude-code"]) provider = "claude-code";
	if (!provider) throw new Error("Connect a model: claude-code-oauth-token (a Claude subscription, from claude setup-token), or anthropic-api-key, openai-api-key or gemini-api-key.");
	if (!keys[provider]) throw new Error(`model "${named}" needs ${KEYS.find(([p]) => p === provider)![1]}.`);
	return makeModel(provider, named || DEFAULT_MODEL[provider], keys[provider]);
}

/** The voice and how it speaks, checked before any model is called. */
export function voiceSettings() {
	const voice = input("voice") || "marcus-aurelius";
	const edge = (input("edge") || "full") as "full" | "clean";
	if (edge !== "full" && edge !== "clean") throw new Error(`edge must be full or clean, not "${edge}".`);
	const humour = input("humour");
	humourOf(undefined, humour);
	return { voice, edge, humour };
}
