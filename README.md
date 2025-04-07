# AI 简历智填助手 (MVP)

## 项目概述

本项目是一个 Chrome 浏览器插件的最小可行产品 (MVP)，旨在利用大型语言模型 (LLM) 的能力，帮助用户自动填充网页上的职位申请表单。用户可以在插件侧边栏预先存储一份详细的简历信息，当访问招聘网站时，通过 AI 分析页面表单结构并进行字段映射，实现一键填充。

本项目基于 Manifest V3 标准开发，目前使用 DeepSeek API (需用户提供 Key) 作为核心 AI 引擎。

**请注意：** 这是一个 MVP 版本，主要用于验证 AI 动态映射方案的可行性，功能和稳定性可能有限。

## 主要功能

* **侧边栏用户界面**: 通过浏览器工具栏图标打开，用于编辑、保存和管理用户的简历信息。
* **本地简历存储**: 使用 `chrome.storage.local` 在用户本地浏览器安全地存储简历数据。
* **动态表单分析**: 自动提取当前网页上的表单元素及其相关属性（ID, name, label, placeholder 等）。
* **AI 字段映射**: 将提取的表单结构和用户简历结构发送给 DeepSeek API，由 AI 分析并返回字段间的映射关系。
* **自动填充**: 根据 AI 返回的映射，将本地存储的简历数据填充到网页表单对应的字段中。
* **状态反馈**: 在侧边栏提供清晰的操作状态提示（分析中、调用 AI、填充中、成功、失败等）。

## 技术栈

* **浏览器插件**: Chrome Extension Manifest V3
* **核心语言**: JavaScript (ES6+)
* **用户界面**: HTML, CSS
* **AI 模型 API**: DeepSeek API (假设兼容 OpenAI Chat Completions API 格式)
* **本地存储**: `chrome.storage.local`

## 文件结构

ai-resume-filler/
├── manifest.json               # 插件配置文件 (权限、脚本、侧边栏等)
├── icons/                      # 插件图标 (16x16, 48x48, 128x128)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── background.js               # 后台 Service Worker (核心逻辑、API 调用、消息路由)
├── content.js                  # 内容脚本 (注入页面，提取表单、执行填充)
├── sidebar/
│   ├── sidebar.html            # 侧边栏界面 HTML 结构
│   ├── sidebar.js              # 侧边栏界面 JavaScript 逻辑 (数据管理、事件处理、与后台通信)
│   └── sidebar.css             # 侧边栏界面 CSS 样式
├── test_pages/
│   └── test_resume_website.html # 用于测试插件功能的复杂表单网页
└── README.md                   # 项目说明文档 (本文档)

## 安装与配置

1.  **前提条件**:
    * 安装 Google Chrome 浏览器。
    * 获取一个有效的 DeepSeek API Key。

2.  **配置 API Key**:
    * 打开项目中的 `background.js` 文件。
    * 找到 `const DEEPSEEK_API_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";` 这一行。
    * 将 `"sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"` 替换为你自己的 **DeepSeek API Key**。
    * **保存文件**。
    * **安全警告**: 切勿将包含真实 API Key 的代码提交到公共仓库或与他人分享。此硬编码方式仅适用于本地开发测试。

3.  **加载插件**:
    * 打开 Chrome，访问 `chrome://extensions/`。
    * 启用页面右上角的 **"开发者模式"**。
    * 点击 **"加载已解压的扩展程序"**。
    * 选择包含本项目的 `ai-resume-filler` **文件夹**。
    * 插件将出现在列表中，确保没有加载错误。

## 使用方法

1.  **打开侧边栏**: 点击 Chrome 工具栏上的插件图标。
2.  **填写/编辑简历**: 在侧边栏表单中详细填写你的简历信息。对于教育、工作经历等部分，可使用 "添加..." 按钮增加条目。
3.  **保存简历**: 点击侧边栏底部的 **"保存简历"** 按钮。数据将保存在本地。
4.  **访问目标页面**: 打开一个包含职位申请表单的网页（例如项目内提供的 `test_pages/test_resume_website.html`）。
5.  **触发 AI 填充**: 确保目标页面是当前活动标签页，然后点击侧边栏底部的 **"AI 填充表单"** 按钮。
6.  **等待与检查**: 观察侧边栏的状态提示，并检查网页上的表单是否被自动填充。**务必仔细检查所有自动填充的内容**，因为 AI 映射可能存在误差。

## 测试

* 使用项目 `test_pages/` 目录下的 `test_resume_website.html` 文件进行基础功能测试。该页面包含了多种类型的表单字段和结构。
* 请参考上面提供的详细 **测试流程** 进行操作。
* 在测试时，打开浏览器开发者工具（侧边栏、后台脚本、目标页面）的 Console，可以查看详细的日志输出和错误信息。

## 工作流程简述

1.  用户点击侧边栏的 "AI 填充表单" 按钮。
2.  `sidebar.js` 向 `background.js` 发送 `startAIFill` 消息。
3.  `background.js` 获取当前标签页 ID，并向该页面的 `content.js` 发送 `extractForm` 请求。
4.  `content.js` 提取页面表单结构信息，并通过 `formExtracted` 消息发送回 `background.js`。
5.  `background.js` 收到表单信息后，从 `storage` 读取用户简历数据。
6.  `background.js` 构建 Prompt (包含任务、简历结构、表单结构)，调用 DeepSeek API。
7.  DeepSeek API 返回字段映射关系 (JSON)。
8.  `background.js` 解析映射结果，并将映射关系和完整简历数据通过 `fillForm` 消息发送给 `content.js`。
9.  `content.js` 根据映射关系和简历数据，在网页上填充表单字段，并触发相关事件。
10. `content.js` 通过 `fillingComplete` 消息将填充结果状态发送回 `background.js`。
11. `background.js` 根据填充结果，通过 `aiStatusUpdate` 消息更新 `sidebar.js` 中的状态显示。

## 局限性与未来考虑

* **API Key 安全**: MVP 版本硬编码 API Key，存在安全风险。未来应考虑用户自行输入、通过安全后端代理等方式管理。
* **AI 依赖与成本**: 功能强依赖 DeepSeek API 的可用性、性能和成本。
* **准确性**: AI 映射并非 100% 准确，尤其对于复杂或非标准表单，可能出现错误或遗漏。
* **填充延迟**: API 调用和处理需要时间 (通常 2-10 秒)，非即时填充。
* **数组/重复项处理**: 当前对表单中重复区域（如多个教育经历输入区）的处理能力有限，主要针对单次出现或简单列表。
* **隐私**: 发送表单结构信息给第三方 AI 服务，需考虑隐私政策透明度。
* **未来改进**:
    * 优化 Prompt Engineering 提升准确率。
    * 实现对页面结构的缓存，减少重复 API 调用。
    * 允许用户反馈和修正 AI 映射结果。
    * 探索更经济或高效的 AI 模型。
    * 对特定高频网站增加本地化映射规则作为补充或回退。
    * 更精细的 UI/UX 设计。






