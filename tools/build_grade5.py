#!/usr/bin/env python3
"""Build the independent Grade 5 word-planet site from one data source."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "grade5.json"
UNIT_TEMPLATE = ROOT / "templates" / "unit.html"
LANDING_TEMPLATE = ROOT / "templates" / "landing.html"

UNIT_DESCRIPTIONS = {
    "unit1": "老师、同学、过去经历与人物描写等校园表达。",
    "unit2": "情绪、感受、校园游戏、寻找失物与昨日经历表达。",
    "unit3": "月份、生日礼物、许愿、家庭聚餐和过去式动作表达。",
    "unit4": "乡村、河流、房屋、果园、田地和采摘生活表达。",
    "unit5": "学期、运动、传球投篮、团队比赛和过去式表达。",
    "unit6": "榜样、职业、历史纪年、坚持、志愿与社区协作表达。",
    "unit7": "传统节日、春节、春联、除夕、压岁钱和祝福表达。",
}

CHINESE_NUMBERS = {
    1: "第一",
    2: "第二",
    3: "第三",
    4: "第四",
    5: "第五",
    6: "第六",
    7: "第七",
}


def replace_between(source, start_marker, end_marker, replacement):
    start = source.index(start_marker)
    end = source.index(end_marker, start + len(start_marker))
    return (
        source[:start]
        + start_marker
        + "\n"
        + replacement
        + "\n\n"
        + source[end:]
    )


def stage_indexes(word_count, stage_count=4):
    groups = [[] for _ in range(stage_count)]
    for index in range(word_count):
        groups[index % stage_count].append(index)
    return groups


def json_constant(value):
    return json.dumps(value, ensure_ascii=False, indent=2)


def page_words(unit):
    return [
        {
            "en": word["en"],
            "zh": word["zh"],
            "ipa": word["ipa"],
            "pos": word["pos"],
            "group": word["group"],
            "zhInContext": word["zhInContext"],
        }
        for word in unit["words"]
    ]


def page_contexts(unit):
    return {
        word["en"]: {
            "sceneId": word["sceneId"],
            "trainingSentence": word["trainingSentence"],
            "trainingZh": word["trainingZh"],
            "trainingCapitalize": word["trainingCapitalize"],
            "acceptanceSentence": word["acceptanceSentence"],
            "acceptanceZh": word["acceptanceZh"],
        }
        for word in unit["words"]
    }


def build_stages(word_count, acceptance=False):
    groups = stage_indexes(word_count)
    if acceptance:
        definitions = [
            (
                "context-read-zh",
                "读句辨义",
                "读完整语境句，选出目标词的中文意思",
            ),
            (
                "context-listen-zh",
                "听句辨义",
                "听完整语境句，选出目标词的中文意思",
            ),
            (
                "context-listen-en",
                "听句选词",
                "听完整语境句，选出空格处的英文单词",
            ),
            (
                "context-zh-en",
                "看句选词",
                "读中文语境，选出空格处的英文单词",
            ),
        ]
    else:
        definitions = [
            ("en-zh", "英译中", "看英文单词并听发音，选出正确的中文意思"),
            ("listen-zh", "听音辨义", "听英语发音，选出正确的中文意思"),
            ("listen-en", "听音选词", "听英语发音，选出正确的英文单词"),
            ("zh-en", "中译英", "看中文意思，选出正确的英文单词"),
        ]
    return [
        {
            "id": index + 1,
            "mode": mode,
            "title": title,
            "instruction": instruction,
            "wordIndexes": groups[index],
        }
        for index, (mode, title, instruction) in enumerate(definitions)
    ]


def apply_page_ui(source, unit, number):
    count = len(unit["words"])
    chapter = CHINESE_NUMBERS[number]
    source = source.replace(
        "单词星球 2.1 · Unit 1",
        f"单词星球 2.1 · 鲁教版5年级上册 · Unit {number} · 全部 {count} 条",
    )
    source = source.replace("UNIT 01 · V2.1", f"UNIT {number:02d} · V2.1")
    source = source.replace("UNIT 01 · 基础词汇", f"UNIT {number:02d} · {unit['titleZh']}")
    source = source.replace("Unit 1 · 基础词汇", f"Unit {number} · {unit['title']}")
    source = source.replace("第一颗学习星球", f"{chapter}颗学习星球")
    source = source.replace("<b>20</b> 个单词", f"<b>{count}</b> 个单词")
    source = source.replace(
        "<b>1</b> 轮混合闯关",
        f"<b>{count}</b> 词混合闯关",
    )
    source = source.replace("<b>20</b> 题抽样验收", "<b>≤20</b> 题抽样验收")
    source = source.replace("<span>20 words</span>", f"<span>{count} words</span>")
    source = source.replace("0 / 20 词条", f"0 / {count} 词条")
    source = source.replace("1 / 20</div>", f"1 / {count}</div>")
    source = source.replace('aria-valuemax="20"', f'aria-valuemax="{count}"')
    source = source.replace(
        '<strong id="milestone-count">0 / 20</strong>',
        f'<strong id="milestone-count">0 / {count}</strong>',
    )
    source = source.replace(
        '<strong id="result-score">20 / 20</strong>',
        f'<strong id="result-score">{count} / {count}</strong>',
    )
    source = source.replace(
        '<strong id="result-word-coverage">20 / 20</strong>',
        f'<strong id="result-word-coverage">{count} / {count}</strong>',
    )
    source = source.replace(
        '<strong id="result-mode-coverage">20 / 20</strong>',
        f'<strong id="result-mode-coverage">{count} / {count}</strong>',
    )
    source = source.replace(
        '<strong id="result-context-coverage">20 / 20</strong>',
        f'<strong id="result-context-coverage">{count} / {count}</strong>',
    )
    source = source.replace("UNIT 01 · 成绩单", f"UNIT {number:02d} · 成绩单")
    source = source.replace(
        "word-planet-unit-1-progress-v4",
        f"word-planet-grade5-v2.1-unit{number}-full-progress-v4",
    )
    source = source.replace(
        "word-planet-unit-1-progress-v3",
        f"word-planet-grade5-v2.1-unit{number}-full-progress-v3",
    )
    source = source.replace(
        "word-planet-unit-1-progress-v2",
        f"word-planet-grade5-v2.1-unit{number}-full-progress-v2",
    )
    tag_start = source.index('<span class="unit-tag">')
    tag_end = source.index("</span>", tag_start) + len("</span>")
    unit_tag = source[tag_start:tag_end]
    source = (
        source[:tag_start]
        + '<div class="topbar-actions" style="display:flex;align-items:center;gap:9px">'
        + '<a class="home-link" href="../../" aria-label="返回全部单元">← 返回单元列表</a>'
        + unit_tag
        + "</div>"
        + source[tag_end:]
    )
    return source


def build_unit_page(template, unit):
    number = int(unit["id"].removeprefix("unit"))
    source = apply_page_ui(template, unit, number)
    words = page_words(unit)
    scenes = unit["scenes"]
    contexts = page_contexts(unit)

    source = replace_between(
        source,
        "const WORDS =",
        "const CONTEXT_SCENES =",
        json_constant(words) + ";",
    )
    source = replace_between(
        source,
        "const CONTEXT_SCENES =",
        "const CONTEXTS =",
        json_constant(scenes) + ";",
    )
    source = replace_between(
        source,
        "const CONTEXTS =",
        "const CONTEXT_ACCEPTANCE_STAGES =",
        json_constant(contexts) + ";",
    )
    source = replace_between(
        source,
        "const CONTEXT_ACCEPTANCE_STAGES =",
        "const STAGES =",
        json_constant(build_stages(len(words), acceptance=True)) + ";",
    )
    source = replace_between(
        source,
        "const STAGES =",
        "function shuffle(",
        json_constant(build_stages(len(words))) + ";",
    )
    return source


def unit_cards(data):
    cards = []
    for unit in data["units"]:
        number = int(unit["id"].removeprefix("unit"))
        cards.append(
            f"""
          <article class="unit-card">
            <span class="unit-kicker">UNIT {number:02d}</span>
            <h3>Unit {number} · {unit['title']}</h3>
            <p class="unit-meta">{len(unit['words'])} 条词条 · {unit['titleZh']}</p>
            <div class="actions">
              <a class="action primary" href="outputs/v2.1-unit{number}/index.html">开始学习</a>
            </div>
          </article>"""
        )
    return "".join(cards)


def build_landing(template, data):
    total_words = sum(len(unit["words"]) for unit in data["units"])
    total_questions = sum(len(unit["words"]) + min(len(unit["words"]), 20) for unit in data["units"])
    source = template
    replacements = [
        (
            "鲁教版六年级英语上册单词星球 2.1 词汇训练页面集合。",
            "鲁教版五年级英语上册单词星球 2.1 词汇训练独立入口。",
        ),
        (
            "单词星球 · 鲁教版六年级英语上册",
            "单词星球 · 鲁教版五年级英语上册",
        ),
        ("鲁教版 · 六年级上册", "鲁教版 · 五年级上册"),
        ("GRADE 6 · ENGLISH VOCABULARY", "GRADE 5 · ENGLISH VOCABULARY"),
        ("<strong>Grade 6</strong>", "<strong>Grade 5</strong>"),
        ("<b>9</b> 个学习单元", "<b>7</b> 个学习单元"),
        ("<b>18</b> 套训练页面", "<b>7</b> 套训练页面"),
        (
            "选择单元，完成四幕故事、逐幕混合闯关、错词补练和抽样验收。\n"
            "            每个单元都提供“全部词条版”和“重点词汇版”。",
            f"选择单元，完成四幕故事、逐幕混合闯关、错词补练和抽样验收。\n"
            f"            全册共 {total_words} 个词条、{total_questions} 道学习题，"
            "全部使用固定英式语音。",
        ),
        (
            "建议使用最新版 Chrome、Edge、Safari 或微信内置浏览器。"
            "单词发音使用固定微软英式语音；",
            "建议使用最新版 Chrome、Edge、Safari 或微信内置浏览器。"
            "所有朗读使用固定微软英式语音；",
        ),
    ]
    for old, new in replacements:
        if old not in source:
            raise ValueError(f"landing: missing template text {old!r}")
        source = source.replace(old, new)

    start = source.index('<div class="unit-grid">')
    end = source.index("      </section>", start)
    source = (
        source[:start]
        + '<div class="unit-grid">'
        + unit_cards(data)
        + "\n        </div>\n"
        + source[end:]
    )
    # Keep the landing totals visible as machine-readable live copy.
    source = source.replace(
        '<span class="fact"><b>90%</b> 验收标准</span>',
        '<span class="fact"><b>90%</b> 验收标准</span>\n'
        f'            <span class="fact"><b>{total_words}</b> 个词条</span>\n'
        f'            <span class="fact"><b>{total_questions}</b> 道学习题</span>',
    )
    return source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT,
        help="Directory that receives index.html and the outputs/ tree.",
    )
    output_root = parser.parse_args().output_root.resolve()
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    unit_template = UNIT_TEMPLATE.read_text(encoding="utf-8")
    landing_template = LANDING_TEMPLATE.read_text(encoding="utf-8")

    for unit in data["units"]:
        number = int(unit["id"].removeprefix("unit"))
        output_dir = output_root / "outputs" / f"v2.1-unit{number}"
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "index.html").write_text(
            build_unit_page(unit_template, unit),
            encoding="utf-8",
        )

    (output_root / "index.html").write_text(
        build_landing(landing_template, data),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "units": len(data["units"]),
                "words": sum(len(unit["words"]) for unit in data["units"]),
                "outputs": str(output_root / "outputs"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
