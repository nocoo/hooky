<p align="center">
  <img src="assets/brand/icon-rounded.png" width="128" height="128" alt="Hooky logo" />
</p>
<h1 align="center">Hooky</h1>
<p align="center">从 Chrome 工具栏或右键菜单，将当前页面信息发送到指定 Webhook。</p>
<p align="center">
  <a href="https://chromewebstore.google.com/detail/hooky/almccnkbhfhckimediabjimflnbfbeeo">Chrome Web Store</a> ·
  <a href="docs/README.en.md">English</a>
</p>

## 这是什么

Hooky 是一个 Chrome 扩展，用于保存 Webhook 模板，并在浏览网页时发送页面 URL、标题、选中文本或元数据。你可以在弹窗中选择模板，使用页面右键菜单，或设置点击工具栏图标时应用的快捷发送规则。

模板、规则和外观设置保存在浏览器本地。请求由扩展发送到你配置的地址，页面数据是否进入请求取决于参数模板。扩展无需账号，接收请求的 Webhook 服务需要自行准备。

## 2.1.0（待发布）

保留 2.0 的紧凑界面、模板和规则，增加更明确的发送反馈与可选采集能力。现有模板无需迁移。需要 Chrome 127 或更高版本。

| 适用范围 | 行为 |
| --- | --- |
| 全部用户，默认生效 | 统一发送状态、持久图标标记、会话内最近结果、进行中请求保护、手动多行输入 |
| 每个 Webhook 单独配置 | 请求头、`{{send.id}}` 绑定、回执读取、JSON 字段与业务条件、完成后重复保护 |
| 用户级可选设置 | 桌面通知：关闭 / 仅错误与未确认结果 / 全部结果 |
| 每次主动操作 | 选择参数框后读取剪贴板；查看原始采集后选择“仍然发送” |

## 功能

- **多个模板**：分别保存名称、目标 URL、HTTP 方法和键值参数。
- **页面变量**：在参数值中引用当前页面信息，发送时替换变量。
- **可选请求头**：每个模板可在高级设置中配置 Authorization、X-API-Key 等请求头，预览始终隐藏请求头值。
- **手动采集**：在发送面板的参数框中输入或粘贴多行文本，只影响本次发送。
- **可选回执**：每个模板可启用少量响应读取，最多 8 KiB、3 秒，仅在扩展面板内显示文本或 JSON。
- **可选权限**：桌面通知默认关闭，可在设置中选择仅错误及未确认结果或全部结果；选择参数框后可主动点击“从剪贴板粘贴”。首次使用分别申请通知或剪贴板权限，拒绝授权仍可正常发送和手动粘贴。
- **快捷发送规则**：点击工具栏图标时，按顺序匹配页面 URL 或标题；首条启用且匹配的规则关联有效模板时直接发送，否则打开弹窗。
- **右键发送**：在页面、选区、链接或图片的右键菜单中选择模板。
- **结果反馈**：三种入口统一显示发送中、成功、接收端错误或结果未确认。快捷发送和右键操作显示页面提示与持久图标标记；面板可查看本次浏览器会话内最近一次发送结果。
- **界面设置**：系统、浅色、深色主题；界面语言跟随 Chrome，包含中英文等多种语言。

规则支持包含、相等、开头、结尾和正则匹配，匹配忽略大小写。页面变量包括：

| 变量 | 内容 |
| --- | --- |
| `{{page.url}}` | 页面 URL |
| `{{page.title}}` | 页面标题 |
| `{{page.selection}}` | 当前选中文本 |
| `{{page.meta.description}}` | description 元数据 |
| `{{page.meta.og:title}}` | Open Graph 标题 |
| `{{page.meta.og:description}}` | Open Graph 描述 |
| `{{page.meta.og:image}}` | Open Graph 图片地址 |
| `{{send.id}}` | 本次逻辑发送的 UUID，正文与请求头共用 |

GET、DELETE 把参数放入查询字符串；POST、PUT、PATCH 发送 JSON 对象，参数值为字符串。Content-Type 固定为 application/json；带自定义请求头的请求不跟随重定向，Cookie、Host 等浏览器管理的请求头不可覆盖。Chrome 内部页等无法注入脚本的页面会退回可用的标签页信息，选中文本和元数据可能为空。

接收端支持幂等键时，可配置 `Idempotency-Key = {{send.id}}`，也可把同一变量放入正文。每次新发送生成新 UUID，进行中的重复触发共用同一次发送。UUID 本身不提供服务端去重；接收端需实现相应语义。粘贴或采集内容中的 `{{…}}` 保持原文，不再次解析。

启用回执后，可选填消息和回执 ID 的 JSON 字段路径，例如 `data.message`、`data.id` 或 `items.0.id`。业务成功字段留空时只判断 HTTP 状态；配置 `saved` 与期望值 `true` 后，Hooky 会严格匹配 JSON 值与类型。未匹配显示业务失败，缺失、超限或无法读取时显示业务结果未确认。HTTP 状态仍单独保留，HTTP 错误不会被正文中的成功标记覆盖。字段匹配表示接收端满足你定义的条件，持久保存的含义仍由接收端约定。

“提醒重复发送”按模板开启，默认关闭；开启时默认 10 秒，可设为 1–300 秒。窗口内相同模板、地址、方法、正文和请求头的请求会显示上次结果，比较时忽略自动生成的发送 UUID。“仍然发送”会重复原始采集并生成新发送 ID，仍受进行中请求保护约束。原始采集仅在后台内存短暂保留，最多 60 秒，后台重启后需重新采集。此保护保留至多 50 条会话摘要，不能替代接收端的幂等处理。

## 使用

从顶部的 Chrome Web Store 链接安装，或按开发章节从源码加载。

1. 打开扩展的选项页，创建 Webhook 模板，填写自己的目标地址与 HTTP 方法。
2. 添加参数，例如 `url = {{page.url}}`、`title = {{page.title}}`，然后保存。
3. 打开目标网页，在弹窗或右键菜单中选择模板发送。
4. 如需一次点击发送，在规则中选择 URL 或标题、匹配条件和模板，并启用该规则。

右键菜单和扩展图标的右键菜单提供“打开发送面板”和“最近发送结果”，这些操作不会触发快捷发送规则。同模板、同内容的请求进行中再次触发会复用正在进行的发送；请求结束后可以再次发送。请求在 20 秒后超时，超时或连接中断表示结果未确认，请先检查接收端；Hooky 不自动重试。HTTP 成功表示接收端响应成功，不保证业务数据已经持久保存。

例如使用 POST 并配置上面的两个参数，接收端得到：

```json
{
  "url": "https://example.com/article",
  "title": "Example article"
}
```

权限包括页面上下文读取、脚本注入、本地存储、右键菜单，以及向自定义地址发送请求所需的 `<all_urls>` 主机权限。页面上下文在用户触发操作时读取；详见[隐私说明](PRIVACY.md)。

## 开发

开发检查需要 Bun、Node.js 24 和 Chrome。扩展运行代码是 JavaScript、HTML 和 CSS，没有前端框架或编译步骤。

```bash
git clone https://github.com/nocoo/hooky.git
cd hooky
bun install --frozen-lockfile
```

在 `chrome://extensions/` 打开开发者模式，点击 **加载已解压的扩展程序**，选择仓库根目录。修改代码后，在扩展管理页重新加载。

```bash
bun run lint
bun run build
```

构建命令将 `manifest.json`、`_locales/` 和 `src/` 打包为 `dist/hooky-<version>.zip`，版本读取自 manifest。它只生成 ZIP，不提交商店发布。

| 路径 | 内容 |
| --- | --- |
| [src/options](src/options) | 模板、规则与设置编辑 |
| [src/popup](src/popup) | 选择模板与发送面板 |
| [src/background.js](src/background.js) | 事件分发和请求执行协调 |
| [src/pagecontext.js](src/pagecontext.js) | 按需读取当前页面信息 |
| [src/store.js](src/store.js) | 本地模板与规则存储 |

## 测试

```bash
bun run test
bun run test:e2e
```

单元测试覆盖模板、参数、规则、存储、界面和请求逻辑。端到端测试由 Puppeteer 启动独立浏览器，创建临时本地 Webhook 接收端，检查配置保存、发送与规则编辑；测试使用独立的无头 Chrome 配置。可以使用 Puppeteer 下载的浏览器，或设置 `PUPPETEER_EXECUTABLE_PATH` 指向本机 Chrome（开发用安装 API 需要 Chrome 137+）。

如安装后缺少测试浏览器，可先运行：

```bash
bunx puppeteer browsers install chrome
```

## 技术栈

| 技术 | 用途 |
| --- | --- |
| JavaScript / HTML / CSS | 扩展逻辑与界面 |
| Chrome Extensions Manifest V3 | Service worker、工具栏、页面脚本和右键菜单 |
| chrome.storage.local | 模板、规则和外观设置 |
| Fetch API | 发送 Webhook 请求 |
| Vitest / jsdom | 单元测试和 DOM 测试 |
| Puppeteer | 浏览器端到端测试 |

## 文档

- [隐私说明](PRIVACY.md)
- [版本记录](CHANGELOG.md)
- [2.1.0 测试与人工验收](TESTING.md)
- [请求参数处理](src/params.js)
- [规则匹配](src/rules.js)

[hexly.ai](https://hexly.ai) 出品。

## 许可证

[MIT](LICENSE)

## 设计稿与发布资料

[概念稿与已通过的家族设计](docs/design/README.md) · [Hooky 2.0.0 资料总览](materials/2.0.0/index.html) · [人工测试说明](materials/2.0.0/TESTING.md)

后续资料从本仓库独立生成：`bun run materials`。原始图像、提示词、英文文案、单页与测试包均按版本归档，目录与使用方法见 [materials/README.md](materials/README.md)。
