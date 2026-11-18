// Silvertongue review: audit a pull request with the developer's own model key, then post the review in a
// famous writing voice. Runs on GitHub's runner; the code goes only to the model provider the developer chose.
import { appendFileSync, readFileSync } from "node:fs";
import { audit as runAudit } from "./audit.ts";
import { GitHub } from "./github.ts";
import { chooseModel, flag, input, output, voiceSettings } from "./inputs.ts";
import { compose, flatten, markdown } from "./review.ts";
import { humourOf, packet, write } from "./voice.ts";

function pullNumber(): number {
	const given = input("pull-request");
	if (given) {
		if (!/^\d+$/.test(given)) throw new Error(`pull-request must be a number, not "${given}".`);
		return Number(given);
	}
	const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) as { pull_request?: { number?: number }; issue?: { number?: number; pull_request?: unknown } } : {};
	const n = event.pull_request?.number ?? (event.issue?.pull_request ? event.issue.number : undefined);
	if (!n) throw new Error(`No pull request in a ${process.env.GITHUB_EVENT_NAME ?? "local"} event. Run on pull_request or pull_request_target, or set pull-request.`);
	return n;
}

async function main() {
	const { voice, edge, humour: asked } = voiceSettings();
	const post = flag("post", true);
	const requestChanges = flag("request-changes", true);
	const [owner, name] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
	if (!owner || !name) throw new Error("GITHUB_REPOSITORY is not set.");
	const token = input("github-token") || process.env.GITHUB_TOKEN || "";
	if (!token) throw new Error("github-token is empty.");
	const model = chooseModel();
	const gh = new GitHub({ owner, name }, token);
	const number = pullNumber();

	const voicePacket = await packet(voice, edge);
	const humour = humourOf(voicePacket.lane, asked);
	const pull = await gh.pull(number);
	console.log(`Reviewing #${number} "${pull.title}" (+${pull.additions} -${pull.deletions}) as ${voicePacket.name}, humour ${humour}, with ${model.id}.`);
	const [files, issues] = await Promise.all([gh.files(number), gh.linkedIssues(pull.body)]);
	const source = gh.fetchSource(pull.headSha, pull.baseSha);

	console.log("::group::Audit");
	const audit = await runAudit(model, pull, files, issues, source, (line) => console.log(line));
	const current = await gh.pull(number);
	if (current.headSha !== pull.headSha || current.baseSha !== pull.baseSha) throw new Error("The pull request changed during review. Rerun against its new head and base; no review was posted.");
	console.log(JSON.stringify(audit, null, 2));
	console.log("::endgroup::");

	const written = await write(model, voicePacket, pull, audit, humour);
	const link = (path: string, line: number) => `${gh.server}/${owner}/${name}/blob/${pull.headSha}/${path}#L${line}`;
	let review = compose(audit, written, voicePacket, model.id, files, link, requestChanges);

	console.log("::group::Review");
	console.log(markdown(review));
	console.log("::endgroup::");
	if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Silvertongue review of #${number}\n\n${markdown(review)}\n`);
	output("verdict", audit.verdict);
	console.log(`${model.id} reported ${model.usage.input.toLocaleString("en")} input and ${model.usage.output.toLocaleString("en")} output tokens.${model.usage.incomplete ? " Native review usage was not reported; these totals are incomplete, not the total bill." : ""}`);

	if (!post) return;
	let posted = await gh.review(number, { commit_id: pull.headSha, ...review });
	if (posted.status === 422 && review.comments.length) {
		// A line GitHub will not take a comment on: post the same review with the comments in its body.
		review = flatten(review, link);
		posted = await gh.review(number, { commit_id: pull.headSha, ...review });
	}
	if (posted.status === 403 || posted.status === 404) {
		throw new Error(`GitHub would not take the review (${posted.status}: ${posted.message}). The job needs "pull-requests: write"; on a pull request from a fork, run on pull_request_target. The review is in this job's summary.`);
	}
	if (posted.status !== 200) throw new Error(`GitHub would not take the review (${posted.status}: ${posted.message}).`);
	console.log(`Posted: ${posted.url}`);
	output("review-url", posted.url ?? "");
}

main().catch((e: unknown) => {
	console.log(`::error::${(e instanceof Error ? e.message : String(e)).replace(/\n/g, "%0A")}`);
	process.exitCode = 1;
});
