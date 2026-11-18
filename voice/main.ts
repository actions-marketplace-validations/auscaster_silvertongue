// Silvertongue's voice pipe: any text in, the same text out in a famous voice, for whatever step comes next
// to post. It shares the review's voice engine (action/voice.ts) and runs on the developer's own model; the
// text goes only to that model's provider, and Silvertongue is asked only for the voice, by its name.
import { appendFileSync } from "node:fs";
import { chooseModel, output, voiceSettings } from "../action/inputs.ts";
import { humourOf, packet, translate } from "../action/voice.ts";

async function main() {
	const text = process.env.INPUT_TEXT ?? "";
	if (!text.trim()) throw new Error("text is empty: give the Action the text to rewrite.");
	const { voice, edge, humour: asked } = voiceSettings();
	const model = chooseModel();
	const voicePacket = await packet(voice, edge, "silvertongue-voice");
	const humour = humourOf(voicePacket.lane, asked);
	console.log(`Writing ${text.length.toLocaleString("en")} characters as ${voicePacket.name}, humour ${humour}, with ${model.id}.`);
	const written = await translate(model, voicePacket, text.trim(), humour);
	output("text", written);
	if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## In the voice of ${voicePacket.name}\n\n${written}\n`);
	console.log(`${model.id} reported ${model.usage.input.toLocaleString("en")} input and ${model.usage.output.toLocaleString("en")} output tokens.`);
}

main().catch((e: unknown) => {
	console.log(`::error::${(e instanceof Error ? e.message : String(e)).replace(/\n/g, "%0A")}`);
	process.exitCode = 1;
});
