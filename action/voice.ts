// The voice engine both Actions share: its writing instructions come from Silvertongue's public MCP server,
// the same packet an agent gets when it writes in a voice with its own model. Only the voice's name is sent;
// the code and the text never are. The review voices its findings with write(); the pipe voices any text
// with translate().
import type { Audit } from "./audit.ts";
import type { Pull } from "./github.ts";
import type { Model } from "./models.ts";

const MCP = "https://mcp.silvertongue.dev/mcp";

export interface Packet {
	voiceId: string;
	name: string;
	instructions: string;
	min: number;
	max: number;
	/** The catalogue's lane for the voice: it decides what kind of funny the voice is. */
	lane: string | undefined;
}

export type Humour = "off" | "light" | "roast";

/** What someone who picks this voice expects when they ask for no level: a comedian roasts, everyone else gives comic relief. */
export function humourOf(lane: string | undefined, input = ""): Humour {
	if (input === "full") return "roast";
	if (input === "off" || input === "light" || input === "roast") return input;
	if (input) throw new Error(`humour must be roast, light or off, not "${input}".`);
	return lane === "comedy" ? "roast" : "light";
}

// How each kind of voice is funny. A comedian tells jokes; a character or a star is funny by being
// themselves at the subject; a style is funny by its register; a sage, a founder or a politician is funny
// by taking it completely seriously. The review's subject is the code; the pipe's is whatever text it is given.
function funny(name: string, lane: string | undefined, subject = "this code", occasion = "a code review"): string {
	if (lane === "comedy") return `${name} is a comedian: being funny is the voice. Write the jokes ${name} would actually tell about ${subject}, with their premise, their turn and their tag, never a quip anyone could make.`;
	if (lane === "characters" || lane === "celebrity") return `${name} is funny by being ${name}: the laugh comes from their persona meeting ${subject}, the way they would react to it, never from jokes stuck on top.`;
	if (lane === "styles") return `${name} is a style, not a person: the laugh is the register itself, said with total conviction about ${occasion}, its own words and moves landing on the specifics of ${subject}.`;
	return `${name} is not a comedian, so never give them a punchline they would not write. The laugh comes from ${name} taking something petty in ${subject} with complete seriousness: their gravity against its triviality, played dead straight.`;
}

/** The bar every joke is held to, whatever the voice is handed. */
function real(subject: string): string {
	return `Every joke is a real one, worth repeating, and built from the specifics of ${subject}.`;
}

// Good code gets its credit. A comedian gives it the way a roast comic does; everyone else as themselves.
function credit(name: string, lane: string | undefined): string {
	if (lane === "comedy") return `When the code is actually good, ${name} admits it, reluctantly: the credit is real and it visibly costs them, and it comes with a dig at whatever small thing deserves one.`;
	return `When the code is actually good, ${name} says so, the way ${name} would.`;
}

const HUMOUR: Record<Humour, string> = {
	off: "Play it straight. Keep the voice, its angle, moves and rhythm, and leave the jokes out.",
	light: "This is a review first, with comic relief. The opening lands one real laugh, and some of the comments have one where the code hands the voice a joke; the rest are the voice played straight. A joke never takes the place of the fix.",
	roast: "This is a roast of the code. Go for the laugh in the opening and in every comment, as hard as this voice would, and still land the fix in each one.",
};

export interface Written {
	summary: string;
	comments: { finding: number; body: string }[];
}

let client = "silvertongue-review";

async function rpc(body: unknown, session?: string): Promise<{ session?: string; message: unknown }> {
	const res = await fetch(MCP, {
		method: "POST",
		headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "user-agent": client, ...(session ? { "mcp-session-id": session } : {}) },
		body: JSON.stringify(body),
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`Silvertongue's voice server answered ${res.status}: ${text.slice(0, 300)}`);
	// Streamable HTTP answers either with JSON or with server-sent events whose data lines carry it.
	const data = text.includes("data:") ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean).at(-1) : text;
	return { session: res.headers.get("mcp-session-id") ?? session, message: data ? JSON.parse(data) : undefined };
}

export async function packet(voice: string, edge: "full" | "clean", from = "silvertongue-review"): Promise<Packet> {
	client = from;
	const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: client, version: "1" } } });
	await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, init.session);
	const { message } = await rpc({
		jsonrpc: "2.0", id: 2, method: "tools/call",
		params: { name: "get_voice_packet", arguments: { voice, format: "explanation", length: "standard", platform: "github", intensity: "full", edge, emoji: "on", spelling: "voice" } },
	}, init.session);
	const result = (message as { result?: { isError?: boolean; content?: { text?: string }[] }; error?: { message?: string } }).result;
	const text = result?.content?.map((c) => c.text ?? "").join("") ?? "";
	if (!result || result.isError) {
		throw new Error(`No voice "${voice}": ${(text || (message as { error?: { message?: string } }).error?.message || "the voice server gave no packet").replace(/\.$/, "")}. Every voice and its slug is listed at https://silvertongue.dev/voices.`);
	}
	const data = (JSON.parse(text) as { data: { voice_id: string; name: string; instructions: string; target: { min: number; max: number } } }).data;
	const slug = data.voice_id.split("@")[0];
	const found = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_voices", arguments: { query: slug, limit: 1 } } }, init.session);
	const listed = (found.message as { result?: { content?: { text?: string }[] } }).result?.content?.map((c) => c.text ?? "").join("") ?? "";
	const lane = listed ? (JSON.parse(listed) as { data: { slug: string; lane: string }[] }).data.find((v) => v.slug === slug)?.lane : undefined;
	if (!lane) throw new Error(`The catalogue did not return the lane for "${slug}". Nothing was written.`);
	return { voiceId: data.voice_id, name: data.name, instructions: data.instructions, min: data.target.min, max: data.target.max, lane };
}

const SCHEMA = {
	type: "object",
	properties: {
		summary: { type: "string" },
		comments: {
			type: "array",
			items: { type: "object", properties: { finding: { type: "integer" }, body: { type: "string" } }, required: ["finding", "body"], additionalProperties: false },
		},
	},
	required: ["summary", "comments"],
	additionalProperties: false,
};

const VERDICT = { reject: "reject (it should not exist in this form)", reshape: "reshape (it should exist, but not in this form)", accept: "accept (it is sound)", comment: "no machine verdict: this is the native reviewer’s report, not an approval" };

export async function write(model: Model, voice: Packet, pull: Pull, audit: Audit, humour: Humour): Promise<Written> {
	const findings = audit.findings.map((f, i) => `${i + 1}. ${f.severity ? `[${f.severity}] ` : ""}\`${f.path}:${f.line}\`${f.category ? ` (${f.category})` : ""}. ${f.challenge} Evidence: ${f.evidence}${f.remedy ? ` Fix: ${f.remedy}` : ""}`);
	const user = `The user is reviewing a GitHub pull request by @${pull.author}, and posts this review as their own. Write it in the voice.

POINT (fixed facts: keep every file path, line number, name and number exactly, code and paths in backticks, and add nothing that is not here. Preserve every condition and qualifier: who is affected and when. Never turn affected callers into every user)
Verdict: ${VERDICT[audit.verdict]}
Pull request: #${pull.number}, "${pull.title}": ${pull.changedFiles} files, +${pull.additions} -${pull.deletions}.
Review assessment: ${audit.assessment}
${findings.length ? `Findings:\n${findings.join("\n")}` : audit.report ? "Inline findings: not supplied. The complete original native report is shown beneath your opening. Summarize only what it actually says; do not invent an approval, fault or fix." : "Findings: none."}

THE DRAFTS
- summary: the opening of the review, ${voice.min} to ${voice.max} words. The verdict and the one thing the author must answer first, the way this voice would say it: its angle on this pull request, not a list of the findings, which the comments carry. Never open with the verdict's wording above.
- comments: one draft for each finding, in order, with its number, two to four sentences, posted on that line of the code. Each is this voice's take on that one finding: its angle, one of its moves, landing on the substantiated problem; include a fix only when the reviewer supplied one. Use a different move from the comment before. The original finding and evidence are shown under each comment, so write the voice, not a restatement of them.
HUMOUR
${humour === "off" ? HUMOUR.off : `${HUMOUR[humour]} ${funny(voice.name, voice.lane)} ${real("this code")} The joke is on the code, never on the author as a person. Never invent a fault to have something to joke about.`} ${credit(voice.name, humour === "off" ? undefined : voice.lane)}

Plain text except code in backticks: no headings, lists or bold. Return them as JSON.`;
	const result = await model.json(voice.instructions, user, SCHEMA, "medium") as Written;
	if (!result || typeof result.summary !== "string" || !result.summary.trim() || !Array.isArray(result.comments) || result.comments.length !== audit.findings.length || new Set(result.comments.map((c) => c.finding)).size !== audit.findings.length || result.comments.some((c) => !Number.isSafeInteger(c.finding) || c.finding < 1 || c.finding > audit.findings.length || typeof c.body !== "string" || !c.body.trim())) throw new Error("The voice did not preserve the review's finding list. No review was posted.");
	return result;
}

// ------------------------------------------------------------------ the pipe: any text, in the voice

const PIPE: Record<Humour, string> = {
	off: "Play it straight. Keep the voice, its angle, moves and rhythm, and leave the jokes out.",
	light: "Say it the way this voice would, with one real laugh where the text hands the voice a joke, and the rest played straight.",
	roast: "Make it a roast. Go for the laugh as hard as this voice would, and keep every point the text makes.",
};

/** What must come through a rewrite exactly as written: code, links, mentions and issue numbers. */
export function fixedParts(text: string): string[] {
	const blocks = [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
	const prose = text.replace(/```[\s\S]*?```/g, " ");
	const inline = [...prose.matchAll(/`[^`\n]+`/g)].map((m) => m[0]);
	const plain = prose.replace(/`[^`\n]+`/g, " ");
	const links = [...plain.matchAll(/https?:\/\/[^\s)<>\]"']+/g)].map((m) => m[0].replace(/[.,;:!?]+$/, ""));
	const refs = [...plain.replace(/https?:\/\/\S+/g, " ").matchAll(/(?<![\w/@#])(?:@[A-Za-z0-9][\w-]*|#\d+)\b/g)].map((m) => m[0]);
	return [...new Set([...blocks, ...inline, ...links, ...refs])];
}

export async function translate(model: Model, voice: Packet, text: string, humour: Humour): Promise<string> {
	const user = `Rewrite this text in the voice. The user posts it as their own.

FIXED (copy these exactly as they are, character for character: every code block and inline code, link, @mention and #number, and every file path, name and number. Add no fact that is not in the text, and drop none: every point it makes stays, in its order)
<text>
${text}
</text>

LENGTH: about as long as the text, never padded.
FORM: keep its Markdown: headings, lists, tables, links and code blocks stay where they are.
HUMOUR
${humour === "off" ? PIPE.off : `${PIPE[humour]} ${funny(voice.name, voice.lane, "what this text says", "this text")} ${real("the text")} The joke is on the subject, never on a person.`}

Return it as JSON.`;
	const result = await model.json(voice.instructions, user, { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false }, "medium") as { text?: unknown };
	const out = typeof result?.text === "string" ? result.text.trim() : "";
	if (!out) throw new Error("The voice returned no text. Nothing was written.");
	const lost = fixedParts(text).filter((part) => !out.includes(part));
	if (lost.length) throw new Error(`The voice changed ${lost.length === 1 ? "a part" : `${lost.length} parts`} that must stay exactly as written, such as ${JSON.stringify(lost[0]!.slice(0, 80))}. Nothing was written.`);
	return out;
}
