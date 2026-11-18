# Silvertongue: Write Like Anyone Famous

**Pipe anything your workflow says through Gordon Ramsay, Marcus Aurelius, Brainrot or any of 65+ famous voices.** Your own code review, a failed build, the release notes, the stale-issue bot. Same facts, better delivery.

It's the voice engine from [Silvertongue: Roast Your Sloppy PRs](../action/README.md), on its own. Give it text, get the same text back in the voice, and post it wherever you like. It runs on your Claude Pro or Max plan, so there's no API bill.

```yaml
- uses: auscaster/silvertongue/voice@v1
  id: voice
  with:
    voice: gordon-ramsay
    text: ${{ steps.review.outputs.report }}
    claude-code-oauth-token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
- run: gh pr comment "$PR" --body "$TEXT"
  env:
    GH_TOKEN: ${{ github.token }}
    PR: ${{ github.event.pull_request.number }}
    TEXT: ${{ steps.voice.outputs.text }}
```

## What comes back

A plain code review of a real pull request, as any reviewer might write it:

```markdown
- `action/main.ts`: The `full` humour value was removed with no alias, so existing workflows now fail validation.
- `action/voice.ts`: `humourOf` compares against the string literal "comedy", which duplicates the `laneSchema` enum value.
- `.github/workflows/review.yml`: The workflow's `humour` input is now free text, so a typo in a manual run only fails after the job starts.
```

The same review, piped through `gordon-ramsay`:

> - `action/main.ts`: The `full` humour value was removed with no alias. Just gone. So existing workflows now fail validation. You don't whip the plate away while people are still holding their forks, yeah?
> - `action/voice.ts`: `humourOf` compares against the string literal "comedy", which duplicates the `laneSchema` enum value. Why are we making the same stock in two pots? One pot. Use the enum, will you?
> - `.github/workflows/review.yml`: The workflow's `humour` input is now free text, so a typo in a manual run only fails after the job starts. That's finding the eggshell after you've already bitten into the omelette. Catch it before it goes in, yes?

## What it keeps

Everything that has to be exact comes through exactly: code blocks and inline code, links, @mentions and #numbers, along with every file path, name and number. If the voice changes any of them, the step fails and writes nothing, so a broken link or a misquoted command never reaches your pull request. Headings, lists and tables stay where they were.

Pass the output on through `env`, as above, rather than writing `${{ steps.voice.outputs.text }}` straight into a `run` script, where the shell would read it as code.

## Pick a voice

Any voice from [the review's list](../action/README.md#pick-your-reviewer), or any slug at [silvertongue.dev/voices](https://silvertongue.dev/voices). `humour` and `edge` work as they do [for the review](../action/README.md#how-funny): a comedian roasts unless you say otherwise, `off` keeps the voice and drops the jokes, and `edge: clean` takes out the swearing.

## Inputs

| Input | Default | |
| --- | --- | --- |
| `text` | | The text to rewrite, such as another step's output. |
| `voice` | `marcus-aurelius` | Any slug at [silvertongue.dev/voices](https://silvertongue.dev/voices). |
| `claude-code-oauth-token` | | A Claude Pro or Max subscription, from `claude setup-token`. Wins when an API key is also given. |
| `anthropic-api-key`, `openai-api-key`, `gemini-api-key` | | Or one API key. |
| `model` | your plan's model; `claude-opus-5-5`, `gpt-6.1-sol` or `gemini-4-argon` for a key | Any model id from that provider. |
| `humour` | the voice's own | `roast`, `light` or `off`. |
| `edge` | `full` | `clean` takes out the voice's swearing and dark humour. |

Output: `text`, the text in the voice. It's also written to the job summary.

## Where your text goes

To the model provider you connected, and nowhere else. Silvertongue's server is asked for one thing: the writing instructions for the voice you picked, by its name. On a Claude plan, each run counts against the plan like any other Claude Code session; an API key is billed by its provider.
