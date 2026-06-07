# vhs tape for the demo GIF.
#
# Regenerate with:   vhs docs/demo.tape
# Outputs:           docs/screenshots/demo.gif
#
# Requires: https://github.com/charmbracelet/vhs

Output docs/screenshots/demo.gif

Set Shell      "zsh"
Set FontSize   14
Set Width      1100
Set Height     650
Set Theme      "Dracula"
Set TypingSpeed 30ms

Type "pnpm probe"
Sleep 500ms
Enter

# Wait for the probe to finish — initialize, tools/list, and a real
# hn_search for "Anthropic" against live HN. Padded so a slow npx
# warmup or HN response doesn't cut the GIF short.
Sleep 10s

Type "# Three tools, one tiny stdio MCP server."
Sleep 2s
