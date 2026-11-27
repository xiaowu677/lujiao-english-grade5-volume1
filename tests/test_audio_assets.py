import json
import unittest
from collections import Counter
from pathlib import Path

from tools.audio_catalog import build_catalog


ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / "outputs" / "assets" / "audio" / "v2.1" / "en-GB-SoniaNeural"


class AudioAssetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = build_catalog(ROOT)
        cls.manifest = json.loads(
            (AUDIO_DIR / "manifest.json").read_text(encoding="utf-8")
        )

    def test_manifest_matches_catalog_exactly(self):
        self.assertEqual(self.manifest["voice"], "en-GB-SoniaNeural")
        self.assertEqual(self.manifest["rate"], "-8%")
        self.assertEqual(self.manifest["count"], 493)
        self.assertEqual(len(self.manifest["items"]), 493)
        self.assertEqual(
            Counter(item["kind"] for item in self.manifest["items"]),
            {
                "word": 155,
                "training": 155,
                "acceptance": 155,
                "story": 28,
            },
        )

        expected = {
            (item["kind"], item["text"]): item["filename"]
            for item in self.catalog
        }
        actual = {
            (item["kind"], item["text"]): item["file"]
            for item in self.manifest["items"]
        }
        self.assertEqual(actual, expected)

    def test_every_manifest_file_exists_and_is_not_empty(self):
        manifest_files = {item["file"] for item in self.manifest["items"]}
        self.assertEqual(
            {path.name for path in AUDIO_DIR.glob("*.mp3")},
            manifest_files,
        )
        for item in self.manifest["items"]:
            path = AUDIO_DIR / item["file"]
            self.assertTrue(path.exists(), item["file"])
            self.assertGreater(path.stat().st_size, 500, item["file"])


if __name__ == "__main__":
    unittest.main()
