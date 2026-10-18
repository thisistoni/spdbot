# Working on SPDBot

Antonio and Ermin are turning this app into SPDBot. Keep it simple: rebrand
the app, fix the remaining German text, replace the default avatars, and ship.
Use the existing architecture. Avoid speculative refactors and extra process.

## Shared context

- Linear: [SPDBot / SPD](https://linear.app/devtones/project/spdbot-596e7a889aac).
- App repo: `thisistoni/spdbot`.
- Landing page repo: `thisistoni/SPD-Studio`; website changes go there.
- [Short roadmap](docs/plans/spdbot-rebrand.md).

## Lead the work, including Git

Explain the next step briefly in German so Ermin understands what is happening.
Handle routine Git work yourself; do not wait for him to ask when to commit,
push, open a PR, or merge. Respect explicit local-only instructions.

1. Read the issue, repo instructions, `git status`, and relevant code. Preserve
   existing work. Use an existing matching Linear issue or create a small one.
2. Fetch the default branch and work on a task branch such as `spd-5-rebrand`.
   Use a separate worktree when needed to protect someone else's changes.
3. Make a small, complete change. Review the diff and run checks appropriate to
   it. Stage only the task's files and commit with a clear message and issue ID.
4. Push the branch to this fork and open/update its PR with the Linear link,
   a short description, checks/results, and screenshots for visible changes.
   Use Draft only for unfinished work; mark completed work ready for review.
5. Follow CI and review comments, fix relevant problems, and push the fixes.
   Antonio's Dot reviews ready PRs regularly. Address concrete blocking findings;
   do not invent an extra manual approval gate beyond GitHub's actual rules.
6. For routine, verified work in the agreed scope, the agent may merge the PR
   once required checks/approvals pass and blocking findings are resolved.
   Resolve clear merge conflicts yourself, preserving both contributors' intent,
   and rerun affected checks. Ask only when the intended result is ambiguous or
   another person's work would be lost. Never bypass branch protection or
   force-push a shared branch.
7. Confirm the merge, update Linear to Done, refresh the clean default branch,
   and use a new branch for the next task. Finish with the PR link, check results,
   and the next step. If access or checks block progress, explain the exact
   blocker and preserve the work instead of claiming it was pushed or merged.

Branches, commits, pushes, PRs, ordinary conflict resolution, and routine merges
are part of the agent's job. Do not leave finished work only locally.
Releases/deployments, destructive changes, and new product decisions still need
a concrete instruction. Keep unrelated cleanup and future ideas in the backlog.

## What to change

- Use **SPDBot** in visible text, icons, titles, and relevant package metadata.
  Remove active Mausbot promotional/help links or replace them with real project
  destinations. Hide unsupported upstream service offers instead of rebuilding
  their services. Avoid unnecessary data-path, protocol, and storage migrations.
- Fix app-owned German copy using the existing locale helpers. English
  `src/locales/en.json` defines keys; German lives in `src/locales/de.json`.
  Preserve placeholders and use a consistent `du` tone. Follow
  [localization.md](docs/localization.md) for source hashes and run
  `pnpm i18n:check` when copy changes. Check affected screens in German.
- Default avatars: **DiceBear Bottts Neutral**. Reuse a shared renderer and a
  stable bot seed; preserve custom uploaded/generated avatars. Keep the
  implementation small and verify small/large sizes and existing status cues.
- Preserve required `LICENSE`, `NOTICE`, and third-party credits. The
  `enterprise/` folder has separate terms; do not redistribute its code or
  bypass its licensing without the required rights. Use the permitted core
  edition for distribution when enterprise rights have not been established.

## Repo and checks

React UI: `src/`; Node server: `server/`; shared types: `shared/`;
desktop shell: `electron/`; remote sidecar: `companion/`.
Read nested `AGENTS.md` files before editing their directories.

Use Node 24+ and the pnpm version in `package.json` (currently 10.33.0).
Use targeted tests plus applicable `pnpm lint`, `pnpm typecheck`,
`pnpm i18n:check`, and `pnpm check:electron`; honor existing hooks and CI.
For documentation alone, check links and `git diff --check`; no new runtime tests.

Verify server/conversation changes with an isolated fixture following
[docs/verification/README.md](docs/verification/README.md), never live user data.
Do not commit secrets, generated `dist*` output, or unrelated changes.
Use clear names and short comments for non-obvious constraints.

## Dot reviews

Review ready PRs in the app and landing-page repos against their issue and
current commit. Report concrete bugs/regressions in German with file/line,
impact, and a useful fix suggestion; state which checks actually ran.
Re-review new commits without repeating unchanged findings. Review permission
alone does not authorize changing code or merging; the implementation workflow
above supplies the separate authorization for routine task merges.

If Dot uses the PR author's GitHub account, it can comment but cannot approve
that author's own PR. Obtain another permitted approval only if GitHub requires
it. Antonio configures the regular Dot check separately.
