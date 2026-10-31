# 家有备 · 集成与来源附录

记录日期：2026-10-30。按项目展示要求，第三方项目名、作者、链接和许可清单不放进 PPT，统一保存在本文件及项目许可文件中。

## 当前主题与实际交付

**家有备：多模态家庭协作中枢。** 看见家庭变化，理解家人的自然表达，先整理安排，经家人确认后协同设备与成员，跟进到明确结果。异地照护是首发场景，长期覆盖日常家庭协作。

本轮没有将演示录像或界面示例改称自研算法成果。以下分别记录原组件、句式数据、协议适配和我们自行完成的整合。引用示例图像不计入家有备摄像头、识别、家庭试用或实物成果。

## GitHub 检索与选择

实际通过 GitHub 官方仓库检索和文件 API 搜索 ElliQ、CarePredict、home assistant llm vision、ESP32 AI voice assistant，并继续核对官方仓库。检索中出现的 ElliQ/CarePredict 同名项目不能确认是商业产品官方开源实现，且多无明确许可，没有集成它们的代码或搬运其商业视频。

选择条件：许可明确、核心能力与既有设备路径相接、可在现有电脑复现、无需新增大型模型。备选 py-xiaozhi 与 Ollama 视觉集成也做了代码/文档阅读；本轮未安装完整桌面语音程序或新的模型服务。

| 项目 | 固定提交 | 根目录许可证 |
| --- | --- | --- |
| [valentinfrlch/llmvision-card](https://github.com/valentinfrlch/llmvision-card) | `0a01fea40d05855628adf50b7b643ab58b424bfb` | Apache-2.0 |
| [valentinfrlch/ha-llmvision](https://github.com/valentinfrlch/ha-llmvision) | `b81d62688f549332194413ae500eed81b313a58e` | Apache-2.0 |
| [78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) | `addb1ed59bd71e09a6a5e0c52ad2f1c474aa8ca1` | MIT |
| [home-assistant/intents](https://github.com/home-assistant/intents) | `b1e9b9890fc444f426cafc073aa588ecdc8a0083` | CC-BY-4.0 |

## 实际复用与改动范围

### 1. 视觉事件时间线

- 原作者：Valentin Fröhlich；项目 `valentinfrlch/llmvision-card`、`valentinfrlch/ha-llmvision`。
- `public/integrations/vendor/timeline/` 中为原构建的时间线组件和依赖。原文件未修改，哈希见 `third_party/manifest.json`，可执行 `npm run home:verify-vendor` 核对。
- `public/integrations/demos/timeline-light.png`、`timeline-popup-light.png` 是同一固定提交中 `assets/` 下的原演示图。应用与 PPT 均标明“界面效果示例／非本家庭实时记录”，不当作本项目采集数据。
- 我们新增：React 适配器、中文日期、界面样式、家庭范围数据 API、筛选和本地详情、白名单同步、关怀证据桥接。时间线中的人物观察不能确认具体身份，也不能直接结案。
- 原组件的详情页带有对外反馈功能。集成时通过自有只读详情替换该入口，不调用反馈上传；图片解析仅允许项目内已知情景配图，真实同步不把外部图片 URL 返回浏览器。真实图像显示需要独立授权代理，当前未实现。
- API 契约采用固定版本 `timeline_openapi_specs.yaml`。真实同步使用配置中的实例、服务端令牌与授权 camera 实体，未找到可运行实例时不冒充已连接。
- 根目录 LICENSE 和 NOTICE 均保留。上游 package.json 的许可字段为 ISC，而 LICENSE/NOTICE 明确为 Apache-2.0；本分发完整附带后两者，并记录该元数据差异。未据 package 字段删除其声明。
- 预编译模块包含 Lit 的 BSD-3-Clause 依赖，原内嵌许可证头保留，完整文本另见下文与 `LIT-LICENSE`。

### 2. 中文家庭设备句式

- 数据项目：Home Assistant 社区贡献者维护的 `home-assistant/intents`，CC BY 4.0。
- 实际使用 `sentences/zh-CN/HassTurnOn/name_only.yaml`、`name_area.yaml` 的默认灯光句式，以及 `rules/zh-CN/common.yaml`、`light.yaml` 中相关展开规则。
- 原数据保存在 `third_party/ha-intents/`，编译子集在 `lib/multimodal/intent-patterns.json`。
- 我们编写了仅处理可选部分、备选项、已支持展开和明确家庭对象的轻量解析器，不宣称覆盖完整 Hassil 或全部语言能力。当前只准备单盏灯光开启；未知房间、歧义、多步组合、否定和受保护动作不执行。
- 改动：抽取支持的句式子集；使用家有备设备别名；将匹配结果改为待批准安排，未复制外部设备控制权限。
- 示例中的中文语句作为解析演练，文本输入不等于已完成语音识别。浏览器语音输入需使用者主动开启，本轮录像未进行真实 ASR 测量。

### 3. 语音终端家庭工具协议

- 协议参考：`78/xiaozhi-esp32`，作者 Shenzhen Xinzhi Future Technology Co., Ltd. 及项目贡献者，MIT。
- 保存的上游文件：`docs/mcp-protocol_zh.md`、`docs/websocket.md` 与 LICENSE。没有复制、烧录或宣称运行了完整固件。
- 我们新增 `/api/multimodal/mcp`：支持标准 JSON-RPC 初始化、工具发现与调用，以及 `{type:"mcp", session_id, payload}` 消息封装。
- 实际可调用：`home.timeline`、`home.light.prepare`、`home.care.prepare`。后两者只准备安排，不能跳过管理员批准。所有调用使用当前登录家庭权限。
- 已验证的是 HTTP 中的工具语义和该消息封装。尚未完成实际终端认证、云服务适配、WebSocket 音频传输、Opus、ASR、TTS 或 ESP32 联调，不能把它描述成整套小智语音链路已经跑通。

### 4. 家有备自己的协作整合

- 本轮新增：多模态中枢 `/home-agent`、时序事件落库、家庭隔离、待确认设备安排、并发批准防重、执行未知保留、联系计划接入原 D1 关怀流程。
- 原有闭环继续负责：家人批准、联系人查看/接手、明确结果、截止时间、服务恢复和审计。
- 集成录像是我们实际操作修改后的应用所得；场景和设备动作采用构造数据及模拟适配器。双账号录像为真实认证测试账号，仍非真实家庭试用。

## 演示文件与复现

| 内容 | 文件 | 性质 |
| --- | --- | --- |
| 多模态中枢实际操作 | `public/evidence/media/home-agent-run.webm` | 原时间线组件、中文句式与工具接口在集成应用内实际运行；synthetic/live |
| 原项目的多事件列表示例 | `public/integrations/demos/timeline-light.png` | 上述固定提交的许可内界面演示，不是家有备家庭数据 |
| 原项目的事件详情示例 | `public/integrations/demos/timeline-popup-light.png` | 同上 |
| 双账号协作 | `public/evidence/media/care-p0-family.webm` / `care-p0-admin.webm` | 独立测试账号的实际软件操作 |
| 新接口检查 | `public/evidence/multimodal-api.json` | 隔离认证/D1、协议及本机假时间线契约 |
| 新浏览器检查 | `public/evidence/multimodal-browser.json` | 实际页面操作、录屏、移动布局与外部请求检查 |

```text
npm run build
npm run home:verify-vendor
npm run test:home:unit
npm run test:home:api
npm run home:prove
npm run deck:family
npm run test:deck:family
```

将来更新上游版本时，应重新核对许可、组件的图片与反馈处理、接口字段，并更新哈希与回归。复制或分发包含这些示例/组件的 HTML 时，应连同本附录及相应许可证提供，正文投影片无需因此增加作者或引用版面。

## 需求背景与之前参考

- [国家统计局 2025 年统计公报](https://www.stats.gov.cn/sj/zxfb/202602/t20260228_1962662.html)：60 岁及以上 32338 万人，占 23.0%。仅作需求背景，不是付费用户规模。
- [ElliQ](https://elliq.com/)：陪伴、健康提醒和家庭连接，仅作产品参考，没有搬入其商业视频或代码。
- [CarePredict @Home](https://www.carepredict.com/who-we-serve/at-home)：Tempo 可穿戴和活动变化观察，仅作产品参考。
- [Home Assistant Assist](https://www.home-assistant.io/voice_control/)：语音与设备生态参考。

真实硬件台架、自然家庭使用、独立识别评估和付费数据仍待采集；不引用竞品营销数字作为家有备成果。

## 演示盘点与本轮补齐（2026-10-31）

已逐一重读这四个固定提交的 README、资源树及实际用例。本轮不新增大型模型、音频云服务或设备烧录。

| 项目 | 找到的原演示 | 实际纳入家有备 |
| --- | --- | --- |
| llmvision-card | 仓库内时间线、详情、预览、组合视图的 PNG；可运行的两种卡片 | 四张浅色原示例图全部可打开；预览卡与时间线组件均接入同一家庭数据。深色同内容变体不重复加入浅色展示 |
| ha-llmvision | 公开说明中的外链图片、网站示例、事件汇总蓝图及时间线契约 | 延续授权时间线同步适配，新增照护/到访/宠物软件情景来运行组件。外链图片和网站视频未确认独立再分发授权，不搬运；没有运行其视觉模型服务 |
| xiaozhi-esp32 | README 的两条 Bilibili 硬件演示、仓库内提示音及协议示例 | 原 popup/success 两个提示音；可实际初始化、发现工具、读取/准备安排的家庭对话界面。外部硬件视频不视为根目录 MIT 自动授权素材，未复制或替换品牌 |
| home-assistant/intents | 无成品视频，提供大量语言测试用例 | 保存 name_only/name_area 原测试；只将 name_only 的三个灯光用例替换为当前家庭设备名，生成可点选的中文指令。门锁、阀门等用例没有接入执行 |

### 原文件与适配

- 新增 `assets/preview.png` → `public/integrations/demos/preview.png`、`assets/cards-hero-light.png` → 同目录同名文件，仍为原字节 Apache-2.0 素材。与既有两张浅色图构成四种可切换界面示例。
- 新增 `main/assets/common/popup.ogg`、`success.ogg` → `terminal-popup.ogg`、`terminal-success.ogg`，采用同固定提交根目录 MIT；目录内未发现另行许可或署名要求。仅作开始/完成提示，不是语音识别或合成回复。
- 新增 `tests/zh-CN/HassTurnOn/name_only.yaml`、`name_area.yaml` → `third_party/ha-intents/test-name-*.yaml`，保留原数据，CC BY 4.0。`lib/multimodal/intent-examples.json` 抽取三个灯光句式，`householdPhrases()` 仅替换设备名称，未采用其原“已打开”回复冒充动作结果。
- 新增 `/experience`：四个可切换体验面板、三种演练情景、动态分类、原预览卡/时间线、本地详情、中文句式、家庭工具对话、原提示音与双账号协作录像。
- 家庭对话输入明确标为预置语句。每次实际发送初始化、工具发现、工具调用请求；连接失败不显示完成。准备灯光和联系计划后仍走原管理员批准，记录保存在本地 D1。
- 演练事件为 synthetic/replay；集成录像为软件实时操作 synthetic/live。图像示例与情景配图均不计为真实家庭采集或识别样本。
- 新增六个原文件已加入 `third_party/manifest.json`，总计四个项目、24 个逐文件 SHA-256。上游代码、图片、声音与数据未编辑，适配器与体验交互由本项目新增。

### 交付和复现

- `public/evidence/media/home-experience-run.webm`：集成后的实际浏览器操作录像。
- `public/evidence/media/home-experience-vision.jpg`、`-intent.jpg`、`-terminal.jpg`、`-family.jpg`：四个面板的实际运行截图。
- `public/evidence/experience-browser.json`：逐项结果、原始章节时间、错误与外部请求记录。新检查使用独立 D1，不改原家庭记录。
- `npm run experience:prove` 重新录制；再运行 `npm run deck:family`、`npm run test:deck:family`。
- 比赛稿仍为 14 页，新增录像章节入口、四张示例切换和两个提示音，全部内嵌离线可用。PPT 正文、弹窗和讲稿不展示这些项目名、作者或仓库链接；本附录承担来源及许可记录。

## 随附许可与版权文本

以下全文随附，保证展示稿与本附录一起分发时保留许可与声明。

### Apache License 2.0（时间线组件与接口契约）

```text
Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work.

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```

### Valentin Fröhlich 的 NOTICE（两仓库相同）

```text
Copyright 2025 Valentin Fröhlich

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at:

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

### MIT（语音终端协议文档）

```text
MIT License

Copyright (c) 2025 Shenzhen Xinzhi Future Technology Co., Ltd.
Copyright (c) 2025 Project Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### CC BY 4.0（中文意图数据）

```text
Attribution 4.0 International

=======================================================================

Creative Commons Corporation ("Creative Commons") is not a law firm and
does not provide legal services or legal advice. Distribution of
Creative Commons public licenses does not create a lawyer-client or
other relationship. Creative Commons makes its licenses and related
information available on an "as-is" basis. Creative Commons gives no
warranties regarding its licenses, any material licensed under their
terms and conditions, or any related information. Creative Commons
disclaims all liability for damages resulting from their use to the
fullest extent possible.

Using Creative Commons Public Licenses

Creative Commons public licenses provide a standard set of terms and
conditions that creators and other rights holders may use to share
original works of authorship and other material subject to copyright
and certain other rights specified in the public license below. The
following considerations are for informational purposes only, are not
exhaustive, and do not form part of our licenses.

     Considerations for licensors: Our public licenses are
     intended for use by those authorized to give the public
     permission to use material in ways otherwise restricted by
     copyright and certain other rights. Our licenses are
     irrevocable. Licensors should read and understand the terms
     and conditions of the license they choose before applying it.
     Licensors should also secure all rights necessary before
     applying our licenses so that the public can reuse the
     material as expected. Licensors should clearly mark any
     material not subject to the license. This includes other CC-
     licensed material, or material used under an exception or
     limitation to copyright. More considerations for licensors:
    wiki.creativecommons.org/Considerations_for_licensors

     Considerations for the public: By using one of our public
     licenses, a licensor grants the public permission to use the
     licensed material under specified terms and conditions. If
     the licensor's permission is not necessary for any reason--for
     example, because of any applicable exception or limitation to
     copyright--then that use is not regulated by the license. Our
     licenses grant only permissions under copyright and certain
     other rights that a licensor has authority to grant. Use of
     the licensed material may still be restricted for other
     reasons, including because others have copyright or other
     rights in the material. A licensor may make special requests,
     such as asking that all changes be marked or described.
     Although not required by our licenses, you are encouraged to
     respect those requests where reasonable. More considerations
     for the public:
    wiki.creativecommons.org/Considerations_for_licensees

=======================================================================

Creative Commons Attribution 4.0 International Public License

By exercising the Licensed Rights (defined below), You accept and agree
to be bound by the terms and conditions of this Creative Commons
Attribution 4.0 International Public License ("Public License"). To the
extent this Public License may be interpreted as a contract, You are
granted the Licensed Rights in consideration of Your acceptance of
these terms and conditions, and the Licensor grants You such rights in
consideration of benefits the Licensor receives from making the
Licensed Material available under these terms and conditions.


Section 1 -- Definitions.

  a. Adapted Material means material subject to Copyright and Similar
     Rights that is derived from or based upon the Licensed Material
     and in which the Licensed Material is translated, altered,
     arranged, transformed, or otherwise modified in a manner requiring
     permission under the Copyright and Similar Rights held by the
     Licensor. For purposes of this Public License, where the Licensed
     Material is a musical work, performance, or sound recording,
     Adapted Material is always produced where the Licensed Material is
     synched in timed relation with a moving image.

  b. Adapter's License means the license You apply to Your Copyright
     and Similar Rights in Your contributions to Adapted Material in
     accordance with the terms and conditions of this Public License.

  c. Copyright and Similar Rights means copyright and/or similar rights
     closely related to copyright including, without limitation,
     performance, broadcast, sound recording, and Sui Generis Database
     Rights, without regard to how the rights are labeled or
     categorized. For purposes of this Public License, the rights
     specified in Section 2(b)(1)-(2) are not Copyright and Similar
     Rights.

  d. Effective Technological Measures means those measures that, in the
     absence of proper authority, may not be circumvented under laws
     fulfilling obligations under Article 11 of the WIPO Copyright
     Treaty adopted on December 20, 1996, and/or similar international
     agreements.

  e. Exceptions and Limitations means fair use, fair dealing, and/or
     any other exception or limitation to Copyright and Similar Rights
     that applies to Your use of the Licensed Material.

  f. Licensed Material means the artistic or literary work, database,
     or other material to which the Licensor applied this Public
     License.

  g. Licensed Rights means the rights granted to You subject to the
     terms and conditions of this Public License, which are limited to
     all Copyright and Similar Rights that apply to Your use of the
     Licensed Material and that the Licensor has authority to license.

  h. Licensor means the individual(s) or entity(ies) granting rights
     under this Public License.

  i. Share means to provide material to the public by any means or
     process that requires permission under the Licensed Rights, such
     as reproduction, public display, public performance, distribution,
     dissemination, communication, or importation, and to make material
     available to the public including in ways that members of the
     public may access the material from a place and at a time
     individually chosen by them.

  j. Sui Generis Database Rights means rights other than copyright
     resulting from Directive 96/9/EC of the European Parliament and of
     the Council of 11 March 1996 on the legal protection of databases,
     as amended and/or succeeded, as well as other essentially
     equivalent rights anywhere in the world.

  k. You means the individual or entity exercising the Licensed Rights
     under this Public License. Your has a corresponding meaning.


Section 2 -- Scope.

  a. License grant.

       1. Subject to the terms and conditions of this Public License,
          the Licensor hereby grants You a worldwide, royalty-free,
          non-sublicensable, non-exclusive, irrevocable license to
          exercise the Licensed Rights in the Licensed Material to:

            a. reproduce and Share the Licensed Material, in whole or
               in part; and

            b. produce, reproduce, and Share Adapted Material.

       2. Exceptions and Limitations. For the avoidance of doubt, where
          Exceptions and Limitations apply to Your use, this Public
          License does not apply, and You do not need to comply with
          its terms and conditions.

       3. Term. The term of this Public License is specified in Section
          6(a).

       4. Media and formats; technical modifications allowed. The
          Licensor authorizes You to exercise the Licensed Rights in
          all media and formats whether now known or hereafter created,
          and to make technical modifications necessary to do so. The
          Licensor waives and/or agrees not to assert any right or
          authority to forbid You from making technical modifications
          necessary to exercise the Licensed Rights, including
          technical modifications necessary to circumvent Effective
          Technological Measures. For purposes of this Public License,
          simply making modifications authorized by this Section 2(a)
          (4) never produces Adapted Material.

       5. Downstream recipients.

            a. Offer from the Licensor -- Licensed Material. Every
               recipient of the Licensed Material automatically
               receives an offer from the Licensor to exercise the
               Licensed Rights under the terms and conditions of this
               Public License.

            b. No downstream restrictions. You may not offer or impose
               any additional or different terms or conditions on, or
               apply any Effective Technological Measures to, the
               Licensed Material if doing so restricts exercise of the
               Licensed Rights by any recipient of the Licensed
               Material.

       6. No endorsement. Nothing in this Public License constitutes or
          may be construed as permission to assert or imply that You
          are, or that Your use of the Licensed Material is, connected
          with, or sponsored, endorsed, or granted official status by,
          the Licensor or others designated to receive attribution as
          provided in Section 3(a)(1)(A)(i).

  b. Other rights.

       1. Moral rights, such as the right of integrity, are not
          licensed under this Public License, nor are publicity,
          privacy, and/or other similar personality rights; however, to
          the extent possible, the Licensor waives and/or agrees not to
          assert any such rights held by the Licensor to the limited
          extent necessary to allow You to exercise the Licensed
          Rights, but not otherwise.

       2. Patent and trademark rights are not licensed under this
          Public License.

       3. To the extent possible, the Licensor waives any right to
          collect royalties from You for the exercise of the Licensed
          Rights, whether directly or through a collecting society
          under any voluntary or waivable statutory or compulsory
          licensing scheme. In all other cases the Licensor expressly
          reserves any right to collect such royalties.


Section 3 -- License Conditions.

Your exercise of the Licensed Rights is expressly made subject to the
following conditions.

  a. Attribution.

       1. If You Share the Licensed Material (including in modified
          form), You must:

            a. retain the following if it is supplied by the Licensor
               with the Licensed Material:

                 i. identification of the creator(s) of the Licensed
                    Material and any others designated to receive
                    attribution, in any reasonable manner requested by
                    the Licensor (including by pseudonym if
                    designated);

                ii. a copyright notice;

               iii. a notice that refers to this Public License;

                iv. a notice that refers to the disclaimer of
                    warranties;

                 v. a URI or hyperlink to the Licensed Material to the
                    extent reasonably practicable;

            b. indicate if You modified the Licensed Material and
               retain an indication of any previous modifications; and

            c. indicate the Licensed Material is licensed under this
               Public License, and include the text of, or the URI or
               hyperlink to, this Public License.

       2. You may satisfy the conditions in Section 3(a)(1) in any
          reasonable manner based on the medium, means, and context in
          which You Share the Licensed Material. For example, it may be
          reasonable to satisfy the conditions by providing a URI or
          hyperlink to a resource that includes the required
          information.

       3. If requested by the Licensor, You must remove any of the
          information required by Section 3(a)(1)(A) to the extent
          reasonably practicable.

       4. If You Share Adapted Material You produce, the Adapter's
          License You apply must not prevent recipients of the Adapted
          Material from complying with this Public License.


Section 4 -- Sui Generis Database Rights.

Where the Licensed Rights include Sui Generis Database Rights that
apply to Your use of the Licensed Material:

  a. for the avoidance of doubt, Section 2(a)(1) grants You the right
     to extract, reuse, reproduce, and Share all or a substantial
     portion of the contents of the database;

  b. if You include all or a substantial portion of the database
     contents in a database in which You have Sui Generis Database
     Rights, then the database in which You have Sui Generis Database
     Rights (but not its individual contents) is Adapted Material; and

  c. You must comply with the conditions in Section 3(a) if You Share
     all or a substantial portion of the contents of the database.

For the avoidance of doubt, this Section 4 supplements and does not
replace Your obligations under this Public License where the Licensed
Rights include other Copyright and Similar Rights.


Section 5 -- Disclaimer of Warranties and Limitation of Liability.

  a. UNLESS OTHERWISE SEPARATELY UNDERTAKEN BY THE LICENSOR, TO THE
     EXTENT POSSIBLE, THE LICENSOR OFFERS THE LICENSED MATERIAL AS-IS
     AND AS-AVAILABLE, AND MAKES NO REPRESENTATIONS OR WARRANTIES OF
     ANY KIND CONCERNING THE LICENSED MATERIAL, WHETHER EXPRESS,
     IMPLIED, STATUTORY, OR OTHER. THIS INCLUDES, WITHOUT LIMITATION,
     WARRANTIES OF TITLE, MERCHANTABILITY, FITNESS FOR A PARTICULAR
     PURPOSE, NON-INFRINGEMENT, ABSENCE OF LATENT OR OTHER DEFECTS,
     ACCURACY, OR THE PRESENCE OR ABSENCE OF ERRORS, WHETHER OR NOT
     KNOWN OR DISCOVERABLE. WHERE DISCLAIMERS OF WARRANTIES ARE NOT
     ALLOWED IN FULL OR IN PART, THIS DISCLAIMER MAY NOT APPLY TO YOU.

  b. TO THE EXTENT POSSIBLE, IN NO EVENT WILL THE LICENSOR BE LIABLE
     TO YOU ON ANY LEGAL THEORY (INCLUDING, WITHOUT LIMITATION,
     NEGLIGENCE) OR OTHERWISE FOR ANY DIRECT, SPECIAL, INDIRECT,
     INCIDENTAL, CONSEQUENTIAL, PUNITIVE, EXEMPLARY, OR OTHER LOSSES,
     COSTS, EXPENSES, OR DAMAGES ARISING OUT OF THIS PUBLIC LICENSE OR
     USE OF THE LICENSED MATERIAL, EVEN IF THE LICENSOR HAS BEEN
     ADVISED OF THE POSSIBILITY OF SUCH LOSSES, COSTS, EXPENSES, OR
     DAMAGES. WHERE A LIMITATION OF LIABILITY IS NOT ALLOWED IN FULL OR
     IN PART, THIS LIMITATION MAY NOT APPLY TO YOU.

  c. The disclaimer of warranties and limitation of liability provided
     above shall be interpreted in a manner that, to the extent
     possible, most closely approximates an absolute disclaimer and
     waiver of all liability.


Section 6 -- Term and Termination.

  a. This Public License applies for the term of the Copyright and
     Similar Rights licensed here. However, if You fail to comply with
     this Public License, then Your rights under this Public License
     terminate automatically.

  b. Where Your right to use the Licensed Material has terminated under
     Section 6(a), it reinstates:

       1. automatically as of the date the violation is cured, provided
          it is cured within 30 days of Your discovery of the
          violation; or

       2. upon express reinstatement by the Licensor.

     For the avoidance of doubt, this Section 6(b) does not affect any
     right the Licensor may have to seek remedies for Your violations
     of this Public License.

  c. For the avoidance of doubt, the Licensor may also offer the
     Licensed Material under separate terms or conditions or stop
     distributing the Licensed Material at any time; however, doing so
     will not terminate this Public License.

  d. Sections 1, 5, 6, 7, and 8 survive termination of this Public
     License.


Section 7 -- Other Terms and Conditions.

  a. The Licensor shall not be bound by any additional or different
     terms or conditions communicated by You unless expressly agreed.

  b. Any arrangements, understandings, or agreements regarding the
     Licensed Material not stated herein are separate from and
     independent of the terms and conditions of this Public License.


Section 8 -- Interpretation.

  a. For the avoidance of doubt, this Public License does not, and
     shall not be interpreted to, reduce, limit, restrict, or impose
     conditions on any use of the Licensed Material that could lawfully
     be made without permission under this Public License.

  b. To the extent possible, if any provision of this Public License is
     deemed unenforceable, it shall be automatically reformed to the
     minimum extent necessary to make it enforceable. If the provision
     cannot be reformed, it shall be severed from this Public License
     without affecting the enforceability of the remaining terms and
     conditions.

  c. No term or condition of this Public License will be waived and no
     failure to comply consented to unless expressly agreed to by the
     Licensor.

  d. Nothing in this Public License constitutes or may be interpreted
     as a limitation upon, or waiver of, any privileges and immunities
     that apply to the Licensor or You, including from the legal
     processes of any jurisdiction or authority.


=======================================================================

Creative Commons is not a party to its public
licenses. Notwithstanding, Creative Commons may elect to apply one of
its public licenses to material it publishes and in those instances
will be considered the “Licensor.” The text of the Creative Commons
public licenses is dedicated to the public domain under the CC0 Public
Domain Dedication. Except for the limited purpose of indicating that
material is shared under a Creative Commons public license or as
otherwise permitted by the Creative Commons policies published at
creativecommons.org/policies, Creative Commons does not authorize the
use of the trademark "Creative Commons" or any other trademark or logo
of Creative Commons without its prior written consent including,
without limitation, in connection with any unauthorized modifications
to any of its public licenses or any other arrangements,
understandings, or agreements concerning use of licensed material. For
the avoidance of doubt, this paragraph does not form part of the
public licenses.

Creative Commons may be contacted at creativecommons.org.
```

### BSD-3-Clause（Lit）

```text
BSD 3-Clause License

Copyright (c) The Lit Project Contributors.
Copyright (c) 2017 Google LLC. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```


## 2026-10-31 终版冲刺补充

本轮在独立分支 sprint/competition-final-20261101 完成。实际研究 10 个 GitHub 候选，新增 React 兼容流程图，强化既有本地姿态模块，并使用 PptxGenJS 制作原生 PowerPoint。候选固定提交和选择见 docs/competition-final/候选研究.md；本轮随交付的完整许可与依赖版本见 deliverables/开源组件与许可证.md 和 deliverables/licenses/。

新核心演示 /showcase 与 deliverables/demo/index.html 使用同一组件，独立本地演示状态。输入为公开动作样例的本次模型输出回放及构造家庭信号，角色为明确标识的演示角色。家人批准、接手、明确结果采用原计划程序，记录和工作流状态真实更新；不向外部家庭联系人或设备发送请求。

衍生关键点、姿态曲线和包含它们的截图/录像遵循 URFD 的 CC BY-NC-SA 4.0，用于非商业学术竞赛展示，完整来源与改动在上述交付许可中。没有复制或伪造竞品实物演示，没有改变原上游版权声明。


## 2026-10-31 空间、照片搭建与记忆接入

本轮分支为 `sprint/home-space-memory`。只扩展应用，不修改 PPT 或语音实现。

| 项目 / 服务 | 固定版本或记录 | 用途与范围 |
| --- | --- | --- |
| [ha-diorama](https://github.com/CarlesRojas/ha-diorama) | `1c38e1943081b1fcb7aa867cff184dd1ce0e9f4b` / v1.8.29，MIT | 实际运行三维渲染器、家具库、编辑器与设备卡。增加中文、本应用身份与持久化适配。版权和完整许可在 `third_party/ha-diorama/LICENSE`，原始 / 修改后的 bundle SHA-256 在 manifest。 |
| 同仓库 DEMO_FLAT、catalog、theme、constants、sofaSpecs | 同一固定提交，源文件以 `.source` 保存 | 家具目录、风格参考、软件示例与接口测试固定布局来源。示例房屋不是根据用户照片生成的结果。 |
| [Depth Anything 3](https://github.com/ByteDance-Seed/Depth-Anything-3) / DA3-BASE | 源码 `3d835ec1a5802d64a8b8b15f817a1ab54809bfe4`；权重版本与 SHA-256 见 `services/home-engine/models.lock.json`，Apache-2.0 | 本机真实多视图几何恢复，输出观察到的表面及相机；不把它等同于整洁的参数化家居模型。 |
| [Mask2Former 实例分割权重](https://huggingface.co/facebook/mask2former-swin-small-coco-instance) | 权重固定记录在 models.lock，HF 模型卡标记 `license: other` | 扫描中的家具候选分离，允许改名与调整。权重许可没有在此推定为 MIT/Apache；正式商业分发前需要核对其具体条款。 |
| [BGE-small-zh-v1.5](https://huggingface.co/BAAI/bge-small-zh-v1.5) | 固定权重 / 校验值见 models.lock，MIT | 本机中文语义向量，与关键词检索结合，按家庭隔离。 |
| [Qwen2.5-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) | 固定权重 / 校验值见 models.lock，Apache-2.0 | 可选本机记忆整理。引用格式不合格时使用检索记录摘录。 |
| [DeepSeek 图像理解](https://api-docs.deepseek.com/zh-cn/guides/vision/) / [JSON Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode/) | 官方 `deepseek-flash` 接口；截至本轮核查 | 用户自己的付费 API。读取所选照片并生成结构化布局，匹配上面的家具库。凭据与调用费用属于用户账号；代码不内置密钥，也不把固定响应测试当作实际云端推理。 |
| [VGGT 官方演示空间的 room 照片](https://huggingface.co/spaces/facebook/vggt) | `26f484ea4b7247bbcaf57874a7138e4a6c4221d9`，8 张输入照片；详细路径见 `public/integrations/room-sample/source.json` | 公开测试输入，用于本次本机几何运行与上传界面验证。不是本团队自采家庭照片。来源许可按上游记录；商业上线的示例输入应换成自己拥有使用权的照片。 |
| three.js | npm `0.186.0`，MIT | 真实扫描 GLB 查看、家具变换与 GLB 导出；原生家居引擎仍使用自身随包版本。 |

`public/integrations/demo-media/` 的空气炸锅图片来自本项目此前已经记录的 MiniCPM 官方演示画面；`space.png` 是已接入的三维家居演示画面；`backyard.gif` 来自固定版本 ha-diorama 的软件示例摄像头素材。它们在家庭记忆中标为示例记录，不作真实家庭采集或识别效果的证据。

固定 API 响应位于 `tests/fixtures/scene-provider.json`，来源于上述 MIT 家具示例。它只用于隔离测试。生产应用没有将其作为 AI 识图结果导入。真实本机几何与 RAG 检索记录在 `test-results/home-upgrade/verified-scan.json` 与 `verified-rag.json`，运行边界详见 `docs/照片搭建与家庭记忆.md`。


## 2026-10-31 统一设备与 Agent 框架

新增统一设备注册表、能力约束、房间/家具绑定、待批准多设备计划、执行租约、逐项回执与 MCP 设备工具，为本项目实现。Home Assistant 适配器依据其 [REST API 官方文档](https://contributors.home-assistant.io/core/internals/rest-api/)，通过 states、services 和实体回读接口对接。未引入新的第三方设备控制 bundle。

本轮清空当前家庭此前的演示记忆，保留三维样例及其原有来源与许可。新设备浏览器检查采用隔离家庭的样例适配器，HTTP 对接检查采用本机契约网关；不将其标为真实 ESP32 或家庭实物演示。照片生成凭据由本机后台保存，产品页面不显示供应商或密钥入口，本轮未发起付费识图请求。实现及扩展方式见 `docs/统一设备与Agent框架.md`。

## 2026-10-31 助手真实工具调用补充

本次后续工作恢复原有顶部六项导航，以大对话框为助手主视觉，并接入真实模型函数调用。依据 [DeepSeek Function Calling 官方说明](https://api-docs.deepseek.com/guides/tool_calls/) 实现多轮工具请求、结果反馈及非思考模式；照片工具继续依据 [视觉输入官方说明](https://api-docs.deepseek.com/zh-cn/guides/vision/) 与 [JSON Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode/) 生成结构化布局。模型只调用服务端登记工具，三维仍使用本文件已记录的 ha-diorama 渲染与家具库。

与上节设备框架阶段不同，本次已完成真实付费模型验证：模型保存记忆并准备多设备计划；另读取上面已记录的 8 张公开 VGGT room 照片，生成 1 房间、15 家具草稿。原生编辑器新增办公椅后保存为 16 家具，并在同一对话应用。测试使用临时隔离家庭，设备为软件样例；未连接实物或改用他人的实物演示。第一次照片调用输出截断、第二次调整配置后成功的经过与成功记录详见 `docs/助手与工具实测.md`。

真实云端记录为 `test-results/home-upgrade/assistant-live-result.json` 与 `assistant-live-photo-result.json`。固定模型响应测试、真实模型结果及已保存真实布局的视觉复查分别标明，不把它们混为同一种证据。服务商和私有配置只记在开发文档，产品页面没有凭据入口。

## 2026-10-31 前端视觉升级与当前产品展示

按用户指定，使用 [Anthropic frontend-design Skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)，读取时 Skill 文件 blob SHA 为 `a5333457c414d20d625f307df945842c0952ecc3`。本次取其设计规划、约束审查、实际页面复查工作方法；具体纸白与松绿配色、组件、响应式排版为家有备项目实现。完整设计规范见 `docs/前端设计系统.md`。

最新版 PPT 保留原 16 页结构，仅更新第 4、6、8、9、15 页的空间、记忆、助手、设备与照片建模展示。第 4 页原外部三维演示视频和第 6 页外部时间线图片已换成当前应用的实际画面；其他旧素材的出处、版本与许可仍保留在本附录和旧版备份中。语音页本轮未改动。

新截图与 3 段录屏由 `scripts/design/capture-current-product.mjs` 在本机 Chrome 运行当前前端采集。使用临时隔离 D1/R2；真实模型内容读取此前保存的实际推理输出，在当前界面重新呈现。记忆保存与检索、设备计划准备/批准/回执、原生三维编辑与保存经过实际服务，没有改写当前演示家庭，也没有额外发起云端模型调用。输入的 8 张公开房间照片仍使用本文件已记录的 VGGT room 来源与许可。

录屏分别是 `space-current`、`assistant-current`、`photo-model-current`，约 14.52、8.76、5.08 秒，已转换为 H.264 MP4 并实际嵌入 PPT。第 15 页视频封面是同一次生成布局的局部实际截图；播放内容展示完整应用。媒体记录在 `test-results/visual-upgrade/product/capture-provenance.json`。文字、模型来源、示例设备与真实设备边界沿用本附录的已有说明。

旧交付包与历史产物归档位置、文件摘要和恢复方式见 `docs/整理与升级记录.md`。当前展示没有复制新的第三方实物录像，也没有将软件回执称为实物验证。

## 2026-10-31 记忆编辑与整洁房间照片实测

本次 PPT 以用户已手动调整的 15 页文件为基础：仅将当前第 6 页（原页码标为 15）完整换为家庭记忆界面，并将结束页页码从 16 校正为 15。其余 13 页的 PowerPoint 渲染图与输入逐字节相同。原有第 4、9 页视频保留并验证实际播放进度；照片页视频随该页内容替换移除。没有对输入文件做整份重绘或恢复用户已删除的页面。

新增截图来自当前真实前端和隔离的 D1/R2 演示家庭。妈妈的联系偏好、爸爸的阅读习惯等是为演示录入的约定，不是真实试用家庭反馈。家庭动态及习惯约定均通过真实接口修改原记录、刷新读取和后续检索检查；记录身份保持不变，不以新增一条记录代替编辑。接口检查还覆盖过期修改冲突、家庭权限、照片归属和更新时间线检索。

照片输入另选 [Mip-NeRF 360 原始项目](https://jonbarron.info/mipnerf360/) 中同一间起居室的 6 个拍摄视角，从 [YuanhaoXD/Mip-NeRF360 镜像](https://huggingface.co/datasets/YuanhaoXD/Mip-NeRF360/tree/main/room/images_4) 下载，文件、原路径和 SHA-256 位于 `public/integrations/tidy-room-sample/source.json`。镜像元数据标记 Apache-2.0，原项目主页未明确列出独立照片许可，本处不将镜像标签视为原摄影作品的完整授权。照片仅作本机公开样例验证，未加入本次 PPT；后续公开商业示例应替换为自有或授权素材。

本次通过现有照片生成接口执行了一次真实云端识图请求，6 张照片 → 1 个房间、20 件家具，服务返回用时 8.76 秒。结果为视觉理解后匹配家具库的近似可编辑布局，不是测量级几何恢复。随后用实际原生编辑器新增办公椅，保存后刷新读取为 21 件、草稿版本 2。现用家庭的四房 66 件家具样例与版本 18 保持一致，没有自动应用新草稿。

证据位于 `test-results/memory-room-upgrade/`：`tidy-room-live-result.json`、`space-browser-results.json`、`memory-browser-results.json`、实际界面截图，以及 `ppt-render/`。PPT 的结构、布局、原生溢出及视频播放结果在 `.care-local/memory-room-upgrade/`，本机私有配置未进入这些证据输出。复查步骤和本机入口见 `docs/记忆编辑与房间实测.md`。

## 2026-10-31 后续：房间操作录屏与语音页配图

按用户后续要求，在记忆页之后新增第 7 页照片搭建展示；当前 PPT 共 16 页。第 5 页在既有排版中补入当前助手界面截图，保留用户手动修改的“听见你的声音”等文字。原有两段视频随页序调整保留在第 4、10 页，视频文件内容逐字节一致。

`scripts/design/record-real-room-flow.mjs` 在独立演示家庭的实际 D1/R2 与当前前端中录制，接入本机已有的真实照片生成服务。通过页面选择前文记录的 6 张同一间起居室公开照片，重新执行一次真实模型请求：生成 1 个房间、22 件家具，服务返回 8.72 秒；之后在原生编辑器新增办公椅，把宽度从 0.65 米调到 0.75 米、角度从 0° 调到 45°，保存草稿，再保存为家庭空间，最终整页刷新核对一致。完成后共 23 件家具。没有用固定模型返回、前端假进度或伪造保存结果替代这段操作。

成片 `deliverables/照片生成与家具编辑.mp4` 为 H.264、1600×1000、41.533 秒。前段为上述连续实际操作；片尾用同一次运行保存的完整配置，在实际服务中重新载入查看，调整观察视角，以便看到完整房间。片尾没有重复调用生成模型，也没有改变生成的家具内容。两段录屏的边界与操作分别记录在 `recording-evidence.json`、`closing-view-evidence.json`。PPT 已内嵌完整成片，验证嵌入字节与独立 MP4 的 SHA-256 一致；PowerPoint 播放检查覆盖开始、中段 18 秒及结尾 35 秒。

第 5 页配图来自当前应用实际助手页面，显示大对话框与既有麦克风入口。框内文字为尚未发送的输入草稿，图片不作为一次语音识别、环境声音检测或语音合成测试的结果。本次没有更改语音模块实现。

这组公开房间照片及其重建结果现已按用户要求加入 PPT；其原始项目、下载镜像、文件摘要与此前许可核查情况仍见前一节和 `public/integrations/tidy-room-sample/source.json`。它们不是本团队自采家庭照片。幻灯片未新增第三方项目名称，来源统一保存在本附录。

运行截图、录屏和实际结果在 `test-results/room-video-upgrade/`；最终结构、字体、布局、视频播放、内容对照及源文档快照检查在 `.care-local/room-video-upgrade/`。除语音页新增图片和新增房间演示页之外，保留的 14 页内容区渲染与源文档一致，后续页码随插页更新。用户在 PowerPoint 中尚未保存的编辑已先做快照，并完整纳入本轮更新；当前家庭四房样例与原有记忆未被录屏数据改写。
