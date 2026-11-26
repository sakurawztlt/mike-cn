---
name: cn-labor-case-research
description: 检索中国大陆法规原文和历史版本，核验最高人民法院指导性案例的官方出处，生成可复核的研究结果。
license: Apache-2.0
metadata:
  mike-type: assistant
  mike-availability: system
  mike-display-name: 中国法 · 法规与案例检索
  author: Mike China contributors
  version: "2.0.0"
  language: zh-CN
  practice: General Legal
  jurisdictions: CN
---

# 中国法 · 法规与案例检索

1. 列出案情中能确认的事实、争点、行为发生日期、地域、当前程序阶段和材料缺口。日期或事实影响检索时先向用户确认。
2. 用 `search_cn_legal_sources` 查法规及其版本。已知法名、条号和相关日期时分别填写 `law`、`article`、`as_of`。用 `kind: case` 和简短去标识化词语或指导性案例编号查最高法发布页。涉及不同争点时分别检索。
3. 用 `read_cn_legal_source` 和返回的 `source_id` 取得选定版本的法规正文或官方案例发布页。引用法条时注明条号、版本、施行日期及官方链接。案例以发布页实际内容为准，核对案号、法院、裁判理由和程序。使用返回的官方链接，拿到文档编号时也用出处面板引用原文。只有目录结果或正文无法读取时，列入「待核验线索」。
4. 输出「争点」「检索范围」「类案矩阵」「法条与核验情况」「待补事实及人工复核」。类案矩阵列标题、案号（缺失时写未核验）、来源链接、原文定位、可比事实、关键差异、对本案有利或不利及核验状态。对报告中的依据使用能回查到原文的链接。
5. 检索覆盖不足时说明缺口。历史版本根据快照内已知的施行、废止和后续版本日期给出候选，适用到个案仍要核对过渡规定。最高法栏目是精选案例发布目录，不代表全国判决库。案号、原文、法律状态和案例代表性不能由模型补造。

流程参考 CSlawyer 的 Claude for Legal 中国法版 `case-comparison`（Apache-2.0），适配 Mike 的工作流格式与本项目的公开资料索引。
