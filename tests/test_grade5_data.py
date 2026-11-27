import json
import re
import unittest
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "grade5.json"
WORKBOOK_PATH = ROOT / "data" / "知识闪记-鲁教版5年级英语 上册单词表V5-修正版.xlsx"

EXPECTED_COUNTS = {
    "unit1": 26,
    "unit2": 20,
    "unit3": 18,
    "unit4": 21,
    "unit5": 16,
    "unit6": 33,
    "unit7": 21,
}

def fill_template(template, word, capitalize=False):
    display = (
        word[:1].upper() + word[1:]
        if capitalize or template.startswith("{{word}}")
        else word
    )
    return template.replace("{{word}}", display)


class Grade5DataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        worksheet = openpyxl.load_workbook(WORKBOOK_PATH, data_only=True).worksheets[0]
        cls.rows = list(worksheet.iter_rows(min_row=2, values_only=True))
        cls.by_unit = {}
        for row in cls.rows:
            cls.by_unit.setdefault(row[0].lower().replace(" ", ""), []).append(row)

    def test_units_and_words_match_v5_in_order(self):
        self.assertEqual(
            [unit["id"] for unit in self.data["units"]],
            list(EXPECTED_COUNTS),
        )
        for unit in self.data["units"]:
            source = self.by_unit[unit["id"]]
            self.assertEqual(len(unit["words"]), EXPECTED_COUNTS[unit["id"]])
            self.assertEqual(
                [word["en"] for word in unit["words"]],
                [word[1] for word in source],
            )
            for actual, row in zip(unit["words"], source):
                self.assertEqual(actual["zh"], row[4])
                self.assertEqual(actual["ipa"], row[2])
                self.assertEqual(actual["pos"], row[5])
                if actual["en"] != "be born":
                    self.assertEqual(actual["trainingZh"], row[8])

    def test_clean_english_forms_and_complete_context(self):
        for unit in self.data["units"]:
            for word in unit["words"]:
                self.assertNotRegex(word["en"], r"[()（）\u4e00-\u9fff]")
                for field in (
                    "group",
                    "zhInContext",
                    "sceneId",
                    "trainingSentence",
                    "trainingZh",
                    "acceptanceSentence",
                    "acceptanceZh",
                ):
                    self.assertTrue(word[field], f"{unit['id']} {word['en']} {field}")
                self.assertEqual(
                    word["trainingSentence"].count("{{word}}"),
                    1,
                )
                self.assertEqual(
                    word["acceptanceSentence"].count("{{word}}"),
                    1,
                )
                self.assertEqual(word["acceptanceZh"].count("{{word}}"), 1)
                self.assertNotEqual(
                    word["trainingSentence"],
                    word["acceptanceSentence"],
                )

    def test_training_sentences_preserve_workbook_examples(self):
        workbook_examples = {(row[0].lower().replace(" ", ""), row[1]): row[7] for row in self.rows}
        for unit in self.data["units"]:
            for word in unit["words"]:
                if word["en"] == "be born":
                    continue
                self.assertEqual(
                    fill_template(
                        word["trainingSentence"],
                        word["en"],
                        word["trainingCapitalize"],
                    ),
                    workbook_examples[(unit["id"], word["en"])],
                    f"{unit['id']} {word['en']}",
                )

    def test_be_born_uses_a_grammatical_phrase_context(self):
        unit = next(unit for unit in self.data["units"] if unit["id"] == "unit6")
        word = next(word for word in unit["words"] if word["en"] == "be born")
        self.assertEqual(word["trainingSentence"].count("{{word}}"), 1)
        self.assertIn("phrase", word["trainingSentence"].lower())

    def test_four_unique_stories_cover_each_unit_exactly_once(self):
        for unit in self.data["units"]:
            self.assertEqual(len(unit["scenes"]), 4)
            expected = {word["en"] for word in unit["words"]}
            scene_words = [word for scene in unit["scenes"] for word in scene["wordEns"]]
            self.assertEqual(len(scene_words), len(set(scene_words)))
            self.assertEqual(set(scene_words), expected)
            for scene in unit["scenes"]:
                self.assertEqual(len(scene["wordEns"]), len(set(scene["wordEns"])))
                for field in ("title", "subtitle", "story", "storyZh"):
                    self.assertTrue(scene[field].strip())
                story = scene["story"].lower()
                for word in scene["wordEns"]:
                    self.assertIn(word.lower(), story)
            for word in unit["words"]:
                scene = next(scene for scene in unit["scenes"] if word["en"] in scene["wordEns"])
                self.assertEqual(word["sceneId"], scene["id"])


if __name__ == "__main__":
    unittest.main()
