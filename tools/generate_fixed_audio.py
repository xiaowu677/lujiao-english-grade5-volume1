#!/usr/bin/env python3
"""Generate the complete fixed Sonia audio set for the Grade 5 site."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOOL_DIR = ROOT / "tools" / "audio-downloader"
if str(TOOL_DIR) not in sys.path:
    sys.path.insert(0, str(TOOL_DIR))

from audio_catalog import build_catalog  # noqa: E402
from audio_downloader import generate_items  # noqa: E402


VOICE = "en-GB-SoniaNeural"
OUTPUT_DIR = ROOT / "outputs" / "assets" / "audio" / "v2.1" / VOICE


def main():
    catalog = build_catalog(ROOT)
    result = asyncio.run(generate_items(catalog, OUTPUT_DIR, VOICE))
    print(
        json.dumps(
            {
                **result,
                "total": len(catalog),
                "audio_dir": str(OUTPUT_DIR),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
