# Auto-start the HoudiniMCP listener (127.0.0.1:9876) once Houdini's UI is up,
# so Claude can connect without clicking anything. Delete this file to disable.
try:
    import hou
    import houdinimcp

    houdinimcp.start_server()
    # hou.session is reset by File > New / Open; keep a second reference so the
    # server (and its polling timer) survives scene changes.
    houdinimcp._autostarted_server = getattr(hou.session, "houdinimcp_server", None)
except Exception as e:
    print(f"HoudiniMCP auto-start failed: {e}")
