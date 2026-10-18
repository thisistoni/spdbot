# SPDBot: short delivery plan

Make the existing app our own product in a few focused days of work:
**SPDBot branding, German copy, and DiceBear Bottts Neutral avatars.**
Keep the current architecture and working features.

[Linear project](https://linear.app/devtones/project/spdbot-596e7a889aac) ·
[Agent workflow](../../AGENTS.md)

## Work now

| Task | Scope |
| --- | --- |
| [SPD-1](https://linear.app/devtones/issue/SPD-1) | Simple agent-led branch, PR, merge, and collaboration instructions. |
| [SPD-5](https://linear.app/devtones/issue/SPD-5) | Replace visible brand/assets and active Mausbot links; update the necessary metadata/docs. |
| [SPD-10](https://linear.app/devtones/issue/SPD-10) | Fix remaining German text in the supported screens and flows. |
| [SPD-15](https://linear.app/devtones/issue/SPD-15) | Replace default avatars with Bottts Neutral, preserving custom images. |
| [SPD-19](https://linear.app/devtones/issue/SPD-19) | Short smoke check, build/package for the platforms actually being shipped, and handoff. |

Branding, text, and avatars can proceed in parallel on separate branches.
No mandatory audit report, separate design approval, full catalog-completeness
project, or technical migration before starting. Handle small necessary fixes
inside the corresponding task. Preserve required notices and use only code the
project has the right to distribute; do not rebuild unowned cloud services.

## How we collaborate

The agent explains the next step briefly in German and handles branch creation,
checks, commits, pushes, PRs, routine conflict resolution, and routine merges.
Dot reviews ready PRs. Honor actual GitHub checks/approvals and address concrete
blocking findings; no extra approval ceremony. Keep Linear status honest:
In Progress while working, In Review for a ready PR, Done after confirmed merge.

## Later

- [SPD-20](https://linear.app/devtones/issue/SPD-20): adapt the landing page to
  the product when needed. Existing page:
  https://jarvis-ai-setup.antoniobeslic.chatgpt.site/ · website repo:
  https://github.com/thisistoni/SPD-Studio.
  It started as a Hermes guide; website work stays in the same Linear project.
- Custom team templates for different use cases, after the basic product is ready.
