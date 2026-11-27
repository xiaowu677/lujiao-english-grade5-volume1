# 单词星球 2.1 · 鲁教版五年级英语上册

面向五年级上册的独立词汇训练站，内容来自 `data/知识闪记-鲁教版5年级英语 上册单词表V5-修正版.xlsx`。

## 成品规模

- 7 个学习单元
- 155 个词条
- 930 道学习题
- 493 条固定微软英式语音 MP3
- 音色：`en-GB-SoniaNeural`，语速 `-8%`

每页包含四幕故事、逐幕混合闯关、错词定向补练、最多 20 题的抽样验收，以及含本次用时的成绩单。

## 单元入口

| 单元 | 词条数 | 页面 |
| --- | ---: | --- |
| Unit 1 · Teachers and Friends | 26 | [开始学习](outputs/v2.1-unit1/index.html) |
| Unit 2 · Feelings | 20 | [开始学习](outputs/v2.1-unit2/index.html) |
| Unit 3 · Birthdays | 18 | [开始学习](outputs/v2.1-unit3/index.html) |
| Unit 4 · Country Life | 21 | [开始学习](outputs/v2.1-unit4/index.html) |
| Unit 5 · Basketball | 16 | [开始学习](outputs/v2.1-unit5/index.html) |
| Unit 6 · Role Models | 33 | [开始学习](outputs/v2.1-unit6/index.html) |
| Unit 7 · Spring Festival | 21 | [开始学习](outputs/v2.1-unit7/index.html) |

## 本地验证

```powershell
python tools\prepare_grade5_data.py
python tools\build_grade5.py
npm.cmd test
node tests\browser_smoke.js
```

浏览器验收截图保存在 `tests/browser-output/`。

## 固定语音

- 音频目录：`outputs/assets/audio/v2.1/en-GB-SoniaNeural/`
- 清单：`manifest.json`
- 类型：`word`、`training`、`acceptance`、`story`
- 页面只通过固定 MP3 播放，不依赖设备 `speechSynthesis`

重新生成语音：

```powershell
python tools\generate_fixed_audio.py
```
