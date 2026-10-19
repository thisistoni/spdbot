# SPD theme evidence

Captured with the real app in an isolated fake-engine workspace on 2026-10-19.
Desktop: 1440×1000; touch viewport: 390×844. All content is synthetic.
See [reproduction and limits](../../spd-theme.md) and [machine-readable results](checks.json).

- [Theme picker, SPD selected, keyboard focus](appearance-desktop.png)
- [Chat, table, code and composer; existing bot-colored messages enabled](chat-desktop.png)
- [Chat with the existing message-color preference explicitly disabled](chat-theme-bubbles.png)
- [Profile menu](menu-desktop.png)
- [Windows caption hover in the renderer fixture](windows-caption-hover.png)
- [Touch chat](chat-mobile.png)
- [Touch theme picker](appearance-mobile.png)

The checks exercise all ten themes, persistence after real page reloads, custom
font preservation, Outfit loading, message-color preferences, narrow layouts,
and the Windows renderer bridge. No page errors or external requests occurred.
Native Windows itself was not available for testing.
