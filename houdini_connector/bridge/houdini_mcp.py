#!/usr/bin/env python
"""Houdini MCP bridge (stdio, stdlib only, Python 3.9+).

Speaks MCP (JSON-RPC over stdio) to the client (Claude) and forwards each tool
call to the `houdinimcp` add-on running inside Houdini, which listens on
127.0.0.1:9876 and uses 4-byte big-endian length-prefixed UTF-8 JSON frames:

    request : {"type": "<command>", "params": {...}}
    response: {"status": "success", "result": ...} | {"status": "error", "message": "..."}

Env vars:
  HOUDINI_MCP_HOST     default 127.0.0.1
  HOUDINI_MCP_PORT     default 9876
  HOUDINI_MCP_TIMEOUT  seconds to wait for a reply, default 120
"""
from __future__ import annotations

import json
import os
import socket
import struct
import sys

HOST = os.environ.get("HOUDINI_MCP_HOST", "127.0.0.1")
PORT = int(os.environ.get("HOUDINI_MCP_PORT", "9876"))
TIMEOUT = float(os.environ.get("HOUDINI_MCP_TIMEOUT", "120"))
SERVER_VERSION = "1.0.0"

NOT_RUNNING = (
    f"Cannot reach the HoudiniMCP add-on at {HOST}:{PORT}. Start Houdini with the add-on installed, "
    "then click 'Start MCP' on the MCP shelf (or run `import houdinimcp; houdinimcp.start_server()` "
    "in the Python Shell)."
)


# --------------------------------------------------------------------------- transport
def _recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("Houdini closed the connection")
        buf += chunk
    return buf


def houdini_call(cmd: str, params: dict | None = None):
    """Send one command to Houdini and return its `result`. Raises RuntimeError on failure."""
    payload = json.dumps({"type": cmd, "params": params or {}}).encode("utf-8")
    try:
        with socket.create_connection((HOST, PORT), timeout=5) as s:
            s.settimeout(TIMEOUT)
            s.sendall(struct.pack(">I", len(payload)) + payload)
            (n,) = struct.unpack(">I", _recv_exact(s, 4))
            reply = json.loads(_recv_exact(s, n).decode("utf-8"))
    except (ConnectionRefusedError, socket.timeout, OSError) as e:
        if isinstance(e, socket.timeout):
            raise RuntimeError(f"Timed out after {TIMEOUT}s waiting for Houdini (it may be busy cooking).")
        raise RuntimeError(NOT_RUNNING)
    if reply.get("status") != "success":
        raise RuntimeError(reply.get("message", "unknown Houdini error"))
    return reply.get("result")


# --------------------------------------------------------------------------- tool table
def _t(name, desc, props=None, required=None):
    return {
        "name": name,
        "description": desc,
        "inputSchema": {"type": "object", "properties": props or {}, "required": required or []},
    }


S, I, B, A, O = {"type": "string"}, {"type": "integer"}, {"type": "boolean"}, {"type": "array"}, {"type": "object"}
ENGINE = {"type": "string", "enum": ["opengl", "karma", "mantra"], "default": "opengl"}

# tool name -> (Houdini command, schema). Tool names equal command names.
TOOLS = [
    _t("ping", "Check the add-on is reachable."),
    _t("get_scene_info", "Current hip file, fps, frame range and a summary of top-level nodes per context."),
    _t("get_node_info", "Parameters, inputs and outputs of one node.", {"path": S}, ["path"]),
    _t("create_node", "Create a node.",
       {"node_type": S, "parent_path": {"type": "string", "default": "/obj"}, "name": S, "position": A, "parameters": O},
       ["node_type"]),
    _t("modify_node", "Rename/move a node or set parameters.",
       {"path": S, "parameters": O, "position": A, "name": S}, ["path"]),
    _t("delete_node", "Delete a node.", {"path": S}, ["path"]),
    _t("connect_nodes", "Wire from_path output into to_path input.",
       {"from_path": S, "to_path": S, "input_index": I, "output_index": I}, ["from_path", "to_path"]),
    _t("disconnect_input", "Disconnect an input of a node.", {"path": S, "input_index": I}, ["path"]),
    _t("set_parameters", "Set several parameters on a node at once (values, expressions, tuples).",
       {"path": S, "parameters": O}, ["path", "parameters"]),
    _t("get_parameter_schema", "List a node's parameters with types/defaults; paginated, filter with a glob.",
       {"path": S, "pattern": S, "offset": I, "limit": I}, ["path"]),
    _t("set_node_flags", "Set display/render/bypass/template flags.",
       {"path": S, "display": B, "render": B, "bypass": B, "template": B}, ["path"]),
    _t("layout_children", "Auto-layout the children of a network.", {"path": S}, ["path"]),
    _t("find_error_nodes", "Find nodes whose last cook produced errors (optionally warnings).",
       {"root_path": {"type": "string", "default": "/obj"}, "include_warnings": B, "max_nodes": I, "limit": I}),
    _t("cook_node", "Force-cook a node and report errors/warnings.", {"path": S}, ["path"]),
    _t("create_wrangle", "Create an Attribute Wrangle with VEX and cook it so compile errors show immediately.",
       {"parent_path": S, "vex_code": S, "name": S,
        "run_over": {"type": "string", "default": "points"}, "input_node": S, "wrangle_type": S},
       ["parent_path", "vex_code"]),
    _t("set_wrangle_code", "Replace the VEX snippet on an existing wrangle.",
       {"path": S, "vex_code": S, "validate": B}, ["path", "vex_code"]),
    _t("get_geometry_info", "Point/prim/vertex counts, bounding box and attribute lists of a SOP's output.",
       {"path": S}, ["path"]),
    _t("get_geometry_data", "Read attribute values from points or primitives, paginated.",
       {"path": S, "element": {"type": "string", "enum": ["points", "primitives"]},
        "attributes": A, "start": I, "limit": I}, ["path"]),
    _t("set_material", "Create/apply a material on an OBJ node.",
       {"node_path": S, "material_type": S, "name": S, "parameters": O}, ["node_path"]),
    _t("execute_code", "Run arbitrary Python inside Houdini (`hou` in scope). Escape hatch; stdout/stderr returned. "
       "Not undo-grouped.", {"code": S}, ["code"]),
    _t("render_single_view", "Render the viewport-framed scene from one angle; returns the image file path.",
       {"orthographic": B, "rotation": A, "render_path": S, "render_engine": ENGINE,
        "karma_engine": {"type": "string", "enum": ["cpu", "gpu"]}}),
    _t("render_quad_view", "Render four orthographic/perspective views; returns image file paths.",
       {"orthographic": B, "render_path": S, "render_engine": ENGINE,
        "karma_engine": {"type": "string", "enum": ["cpu", "gpu"]}}),
    _t("render_specific_camera", "Render through a camera node; returns the image file path.",
       {"camera_path": S, "render_path": S, "render_engine": ENGINE,
        "karma_engine": {"type": "string", "enum": ["cpu", "gpu"]}}, ["camera_path"]),
]
TOOL_NAMES = {t["name"] for t in TOOLS}


# --------------------------------------------------------------------------- MCP loop
def _send(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def _handle(req: dict) -> dict | None:
    method, rid = req.get("method"), req.get("id")
    if rid is None:  # notification
        return None
    if method == "initialize":
        result = {
            "protocolVersion": (req.get("params") or {}).get("protocolVersion", "2024-11-05"),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "houdini", "version": SERVER_VERSION},
        }
    elif method == "tools/list":
        result = {"tools": TOOLS}
    elif method == "tools/call":
        p = req.get("params") or {}
        name, args = p.get("name"), p.get("arguments") or {}
        if name not in TOOL_NAMES:
            return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32602, "message": f"Unknown tool: {name}"}}
        try:
            out = houdini_call(name, args)
            result = {"content": [{"type": "text", "text": json.dumps(out, indent=2, default=str)}]}
        except RuntimeError as e:
            result = {"content": [{"type": "text", "text": str(e)}], "isError": True}
    elif method == "ping":
        result = {}
    else:
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"Method not found: {method}"}}
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            resp = _handle(json.loads(line))
        except Exception as e:  # never let one bad request kill the bridge
            resp = {"jsonrpc": "2.0", "id": None, "error": {"code": -32603, "message": str(e)}}
        if resp is not None:
            _send(resp)


if __name__ == "__main__":
    main()
