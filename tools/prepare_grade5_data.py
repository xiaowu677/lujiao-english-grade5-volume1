#!/usr/bin/env python3
"""Merge the corrected Grade 5 workbook with authored contexts and stories."""

from __future__ import annotations

import json
import re
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "data" / "知识闪记-鲁教版5年级英语 上册单词表V5-修正版.xlsx"
CONTENT = ROOT / "data" / "content.json"
OUTPUT = ROOT / "data" / "grade5.json"

GROUP_BY_POS = {
    "n.": "noun",
    "v.": "verb",
    "adj.": "adjective",
    "adv.": "adverb",
    "pron.": "pronoun",
    "prep.": "preposition",
    "phr.": "phrase",
    "modal v.": "modal",
    "det.": "determiner",
    "num.": "number",
    "abbr.": "abbreviation",
    "conj.": "conjunction",
    "interj.": "interjection",
}

ZH_CONTEXT_OVERRIDES = {
    "Teachers’ Day": "教师节",
    "be": "是",
    "must": "必须",
    "shh": "嘘",
    "pleasure": "乐事",
    "really": "真的",
    "was": "was",
    "were": "were",
    "shout": "喊叫",
    "shout at": "对某人大声叫嚷",
    "game": "游戏",
    "worried": "担心",
    "again": "再",
    "last": "上周",
    "near": "附近",
    "parent": "家长",
    "lot": "大量",
    "any": "一些或任何",
    "dish": "菜",
    "did": "尽",
    "grader": "学生",
    "after": "之后",
    "their": "他们的",
    "basket": "篮筐",
    "pass": "递给",
    "shot": "投篮",
    "won": "获胜",
    "more": "更多",
    "hard": "努力地",
    "as": "作为",
    "medical": "医疗",
    "Spring Festival couplets": "春联",
    "lucky": "幸运",
    "before": "之前",
    "next": "下一个",
}

TRAINING_OVERRIDES = {
    "be born": (
        "When we talk about a person's beginning, we use the phrase {{word}}.",
        "当我们谈论一个人何时何地来到这个世界时，会用到短语“出生”。",
    ),
}


def read_workbook_units():
    worksheet = openpyxl.load_workbook(WORKBOOK, data_only=True).worksheets[0]
    units = {}
    for row in worksheet.iter_rows(min_row=2, values_only=True):
        unit, en, ipa, _syllables, zh, pos, _hint, example, translation, _audio = row
        unit_id = unit.lower().replace(" ", "")
        units.setdefault(unit_id, []).append(
            {
                "en": en,
                "zh": zh,
                "ipa": ipa,
                "pos": pos,
                "group": GROUP_BY_POS.get(pos, "other"),
                "trainingSentence": example,
                "trainingZh": translation,
            }
        )
    return units


def merge_unit(source, authored):
    workbook_words = source[authored["id"]]
    scenes = authored["scenes"]
    scene_by_word = {}
    for scene in scenes:
        for word in scene["wordEns"]:
            if word in scene_by_word:
                raise ValueError(f"{authored['id']}: {word} appears in two scenes")
            scene_by_word[word] = scene["id"]

    words = []
    for word in workbook_words:
        acceptance = authored["acceptance"].get(word["en"])
        if not acceptance:
            raise ValueError(f"{authored['id']}: missing acceptance for {word['en']}")
        if word["en"] not in scene_by_word:
            raise ValueError(f"{authored['id']}: {word['en']} has no scene")

        training, training_zh = TRAINING_OVERRIDES.get(
            word["en"],
            (word["trainingSentence"], word["trainingZh"]),
        )
        training_capitalize = False
        if word["en"] not in TRAINING_OVERRIDES:
            pattern = rf"(?<![A-Za-z]){re.escape(word['en'])}(?![A-Za-z])"
            match = re.search(pattern, training, flags=re.IGNORECASE)
            training_capitalize = bool(
                match and match.group(0)[:1].isupper()
            )
            training = re.sub(
                pattern,
                "{{word}}",
                training,
                count=1,
                flags=re.IGNORECASE,
            )

        words.append(
            {
                **word,
                "zhInContext": ZH_CONTEXT_OVERRIDES.get(
                    word["en"],
                    word["zh"].split("；", 1)[0],
                ),
                "sceneId": scene_by_word[word["en"]],
                "trainingSentence": training,
                "trainingZh": training_zh,
                "trainingCapitalize": training_capitalize,
                "acceptanceSentence": acceptance[0],
                "acceptanceZh": acceptance[1],
            }
        )

    extra_words = set(authored["acceptance"]) - {word["en"] for word in workbook_words}
    if extra_words:
        raise ValueError(f"{authored['id']}: extra acceptance words {sorted(extra_words)}")

    return {
        "id": authored["id"],
        "title": authored["title"],
        "titleZh": authored["titleZh"],
        "words": words,
        "scenes": scenes,
    }


def main():
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    workbook_units = read_workbook_units()
    result = {
        "version": content["version"],
        "grade": content["grade"],
        "volume": content["volume"],
        "publisher": content["publisher"],
        "units": [
            merge_unit(workbook_units, unit)
            for unit in content["units"]
        ],
    }
    OUTPUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    counts = {unit["id"]: len(unit["words"]) for unit in result["units"]}
    print(json.dumps({"output": str(OUTPUT), "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
