"""Public import facade for the vendored audio catalog tool."""

from __future__ import annotations

import sys
from pathlib import Path


TOOL_DIR = Path(__file__).resolve().parent / "audio-downloader"
if str(TOOL_DIR) not in sys.path:
    sys.path.insert(0, str(TOOL_DIR))

from audio_catalog import build_catalog  # noqa: E402


__all__ = ["build_catalog"]
