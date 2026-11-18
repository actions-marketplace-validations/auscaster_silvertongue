import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { output } from "../action/inputs.ts";
import { fixedParts, translate } from "../action/voice.ts";

const voice = { voiceId: "gordon-ramsay@sha256:0", name: "Gordon Ramsay", instructions: "", min: 100, max: 220, lane: "characters" };
const text = "Build failed on `npm test`: 3 of 51 tests broke in `test/voice.test.ts`. See https://github.com/acme/app/actions/runs/7 and ping @kam about #42.\n\n```sh\nnpm test -- --grep voice\n```";
const fake = (reply: unknown, seen?: { user: string }) => ({
	provider: "openai" as const, id: "fake", usage: { input: 0, output: 0 }, review: async () => undefined,
	json: async (_system: string, user: string) => { if (seen) seen.user = user; return reply; },
});

test("the parts a rewrite must keep are its code, links, mentions and issue numbers, not emails or headings", () => {
	assert.deepEqual(fixedParts(text), ["```sh\nnpm test -- --grep voice\n```", "`npm test`", "`test/voice.test.ts`", "https://github.com/acme/app/actions/runs/7", "@kam", "#42"]);
	assert.deepEqual(fixedParts("# Release notes\nWrite to a@b.com."), []);
});

test("the pipe hands the text to the voice and returns its rewrite when every fixed part survives", async () => {
	const seen = { user: "" };
	const rewrite = "Three tests, raw, in `test/voice.test.ts`, after `npm test` fell over. Look: https://github.com/acme/app/actions/runs/7. @kam, #42 is yours.\n\n```sh\nnpm test -- --grep voice\n```";
	assert.equal(await translate(fake({ text: rewrite }, seen), voice, text, "light"), rewrite);
	assert.ok(seen.user.includes(text));
	assert.match(seen.user, /Gordon Ramsay is funny by being Gordon Ramsay/);
	const straight = { user: "" };
	await translate(fake({ text: rewrite }, straight), voice, text, "off");
	assert.match(straight.user, /leave the jokes out/);
	assert.doesNotMatch(straight.user, /funny by being/);
});

test("the pipe writes nothing when the voice changes code, a link or a mention, or returns nothing", async () => {
	for (const broken of [text.replace("--grep voice", "--grep VOICE"), text.replace("@kam", "Kam"), text.replace("runs/7", "runs/8"), ""]) {
		await assert.rejects(translate(fake({ text: broken }), voice, text, "roast"), /must stay exactly as written|returned no text/);
	}
});

test("a step output that runs over several lines arrives whole", () => {
	const file = join(mkdtempSync(join(tmpdir(), "silvertongue-output-")), "out");
	process.env.GITHUB_OUTPUT = file;
	try {
		output("text", "line one\nline two");
		output("verdict", "accept");
	} finally {
		delete process.env.GITHUB_OUTPUT;
	}
	assert.equal(readFileSync(file, "utf8"), "text<<SILVERTONGUE_EOF\nline one\nline two\nSILVERTONGUE_EOF\nverdict<<SILVERTONGUE_EOF\naccept\nSILVERTONGUE_EOF\n");
});
