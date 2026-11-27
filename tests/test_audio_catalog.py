import unittest
from collections import Counter
from pathlib import Path

from tools.audio_catalog import build_catalog


ROOT = Path(__file__).resolve().parents[1]


class AudioCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items = build_catalog(ROOT)

    def test_catalog_contains_exactly_the_grade_five_audio_set(self):
        self.assertEqual(len(self.items), 493)
        self.assertEqual(
            Counter(item["kind"] for item in self.items),
            {
                "word": 155,
                "training": 155,
                "acceptance": 155,
                "story": 28,
            },
        )
        self.assertEqual(len({item["id"] for item in self.items}), 493)

    def test_clean_past_tense_word_is_in_the_catalog(self):
        item = next(
            item
            for item in self.items
            if item["kind"] == "word" and item["text"] == "was"
        )
        self.assertEqual(item["sources"], ["v2.1-unit1"])

    def test_special_training_contexts_are_audio_ready(self):
        training_texts = {
            item["text"] for item in self.items if item["kind"] == "training"
        }
        self.assertIn(
            "When we talk about a person's beginning, we use the phrase be born.",
            training_texts,
        )
        self.assertIn(
            "The family gathered for dinner on New Year’s Eve.",
            training_texts,
        )

    def test_ids_are_stable_safe_mp3_names(self):
        for item in self.items:
            self.assertRegex(item["id"], r"^[a-z]+-[0-9a-f]{16}$")
            self.assertTrue(item["filename"].endswith(".mp3"))
            self.assertNotIn("/", item["filename"])
            self.assertNotIn("\\", item["filename"])
            self.assertTrue(item["text"].strip())


if __name__ == "__main__":
    unittest.main()
