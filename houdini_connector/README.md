# Houdini MCP

Lets Claude (or any MCP client) inspect and edit a running Houdini session: build node networks, set parameters,
write VEX wrangles, read geometry, find cook errors, render views, and run Python.

```
Claude  <--stdio MCP-->  bridge/houdini_mcp.py  <--TCP 127.0.0.1:9876-->  houdinimcp add-on (inside Houdini)
```

Every scene-editing command is wrapped in one undo group (`MCP: <command>`), so Ctrl+Z reverts an agent action.

## Install

Requirements: Houdini with PySide2/PySide6 (developed and tested on 22.0; the 21.0 branch of the code path is untested here), Python 3.9+ on the machine running the client. No pip installs.

1. **Add-on into Houdini** (Windows PowerShell):
   ```powershell
   .\install.ps1 -HoudiniVersion 22.0 -AutoStart
   ```
   This copies `houdinimcp` to `Documents\houdini22.0\scripts\python\` and the **MCP** shelf to `toolbar\`.
   `-AutoStart` also drops `uiready.py` so the listener starts as soon as Houdini's UI is up. Without it, click
   **Start MCP** on the MCP shelf. On macOS/Linux copy `houdini_addon/scripts` and `houdini_addon/toolbar`
   into your `~/houdiniXX.X/` folder by hand.
2. **Register the bridge with Claude**, using the absolute path to `bridge/houdini_mcp.py`:
   ```bash
   claude mcp add houdini -- python /path/to/houdini-mcp/bridge/houdini_mcp.py
   ```
   or add `examples/claude_mcp_config.json` to Claude Desktop's `claude_desktop_config.json`.
3. Start Houdini, then ask Claude to call `ping` / `get_scene_info`.

Env vars for the bridge: `HOUDINI_MCP_HOST` (127.0.0.1), `HOUDINI_MCP_PORT` (9876), `HOUDINI_MCP_TIMEOUT` (120 s).

## Tools

| Area | Tools |
|---|---|
| Scene | `ping`, `get_scene_info`, `find_error_nodes` |
| Nodes | `get_node_info`, `create_node`, `modify_node`, `delete_node`, `connect_nodes`, `disconnect_input`, `set_node_flags`, `layout_children`, `cook_node` |
| Parameters | `set_parameters`, `get_parameter_schema` |
| VEX | `create_wrangle`, `set_wrangle_code` (compile errors reported on cook) |
| Geometry | `get_geometry_info`, `get_geometry_data` |
| Materials | `set_material` |
| Render | `render_single_view`, `render_quad_view`, `render_specific_camera` (OpenGL / Karma / Mantra) |
| Escape hatch | `execute_code` (arbitrary Python, `hou` in scope) |

## Security

The listener binds to `127.0.0.1` only, but `execute_code` runs arbitrary Python with the privileges of your
Houdini session. Don't expose the port, and only start the listener when you want an agent connected.

## Troubleshooting

- *Cannot reach the HoudiniMCP add-on*: listener not running. Click **Start MCP**, or in the Python Shell:
  `import houdinimcp; houdinimcp.start_server()`.
- Replies time out: Houdini is busy cooking or simulating (the add-on handles one request at a time on the main thread).
- Port in use: `houdinimcp.start_server(port=9877)` and set `HOUDINI_MCP_PORT=9877` for the bridge.

See `CLAUDE.md` for architecture notes and how to add tools.

License: none chosen yet. The add-on's structure follows the common community houdini-mcp pattern, so check
upstream licensing before publishing this repo publicly.
