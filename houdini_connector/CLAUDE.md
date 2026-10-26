# Houdini MCP — notes for Claude

Two halves, connected by a local socket (127.0.0.1:9876, 4-byte big-endian length + UTF-8 JSON):

- `houdini_addon/scripts/python/houdinimcp/` runs **inside Houdini** (`server.py`: command handlers, polled by a
  QTimer on the main thread so `hou` calls are safe; `HoudiniMCPRender.py`: viewport/camera render helpers).
- `bridge/houdini_mcp.py` is the stdio MCP server Claude launches. Stdlib only. Its `TOOLS` table mirrors the
  add-on's `handlers` dict one-to-one (tool name == command name).

Adding a tool: write `def my_cmd(self, ...)` on `HoudiniMCPServer`, register it in `handlers` in
`_execute_command_internal` (and in `MUTATING_COMMANDS` if it edits the scene so it is one Ctrl+Z), then add a
`_t(...)` entry to `TOOLS` in the bridge. Restart the bridge (reconnect the MCP server) and, in Houdini,
`import importlib, houdinimcp; houdinimcp.restart_server()` after reloading the modules (or restart Houdini).

Things to know when adapting:
- Single-threaded: a long cook/sim blocks replies; the bridge times out after `HOUDINI_MCP_TIMEOUT` (120 s).
- Newest client wins the socket; there is only one client slot.
- `execute_code` runs arbitrary Python with no sandbox. The listener binds to localhost only; keep it that way.
- Avoid `hou.setFrame` loops in scripts on scenes with sims/crowds (they cook every frame); prefer `evalAtFrame`.
- Render helpers default their output to the OS temp dir and return file paths, not image data.
- `server.py` imports `requests` (used only by the Opus/asset import paths) and the render module needs `numpy`;
  both ship with Houdini's Python. Houdini 21+ uses PySide6, older uses PySide2 (handled at import).
- Asset-library commands (`search_assets`, ...) are placeholders, gated by `hou.session.houdinimcp_use_assetlib`.
