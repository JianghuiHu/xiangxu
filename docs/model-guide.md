# AI 模型指南

AI 抠图是可选能力。没有安装任何模型时，导入、裁切、缩放、画布、蒙版、水印、预设、压缩和批量导出仍可使用。

## PP-MattingV2

- 用途：人像与发丝边缘抠图。
- 输入：固定 `1×3×512×512`。
- 本地转换权重大小：35,940,680 字节。
- SHA-256：`8286b1a110360e868d54ad00319aaa12d5e7bba79ee42e057d67fa5baa8962ff`。
- 来源与转换信息：见 `assets/models/README.md`。

该权重随产品提供，位置为：

```text
assets/models/ppmattingv2-stdc1-human-512.onnx
```

应用优先通过 HTTP `HEAD` 检测文件；本地服务器不支持 `HEAD` 时自动回退到轻量 `GET` 探测，避免误报为缺失。

## u2netp

- 用途：内置的轻量通用前景分割。
- 文件：`assets/models/u2netp.onnx`。
- 大小：4,574,861 字节。
- SHA-256：`309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`。

PP-MattingV2 与 u2netp 均无需下载，不写入 IndexedDB；加载时会核对文件大小和 SHA-256。

## 删除与重装

两个内置模型不能从模型区删除。旧版本遗留的 IndexedDB 模型不会覆盖随产品提供的内置版本。

## 更多开源模型

AI 抠图设置中的“更多开源模型”是只读资料目录，与像序的模型安装器分离。目录只展示第三方项目介绍和下载入口，不会获取模型文件，也不会写入 IndexedDB。

目录数据位于：

```text
models/external-models.json
```

每张模型卡必须提供许可证、适用场景、运行环境和兼容状态。所有对外入口必须使用 HTTPS、新窗口和第三方网站确认提示。GitCode 条目只能标记为“国内源码镜像”，不能标记为官方仓库。

PaddleSeg 是图像分割开发套件，不作为单一抠图模型展示；目录以其中的人像模型 PP-MattingV2 为具体条目。其官方 Paddle 推理包不能直接导入像序网页版，需要先完成 ONNX 转换、输入输出适配和精度验证。

外部模型在模型下拉框中只作为“资料与适配候选”出现。选择后 AI 开关会禁用，主按钮改为“查看下载与适配方案”。模型卡按顺序展示权重选择、ONNX 转换、输入输出适配和回归验证；只有形成经过验证的像序适配器后，模型才能升级为可启用选项。这样既保留发现和下载入口，也不会把不兼容权重误报为可用模型。

## 本地服务器要求

ONNX Runtime Web 依赖 ES Module 和 WASM。`.mjs` 必须返回 `text/javascript`，`.wasm` 必须返回 `application/wasm`；若服务器把 `.mjs` 返回为 `application/octet-stream`，浏览器会拒绝加载运行时。Windows、macOS、PowerShell 回退服务器和桌面封装均维护相同 MIME 映射。

## 许可证

ONNX Runtime Web、模型代码许可证和模型权重许可证彼此独立。发布模型附件前必须再次核实原始来源、转换链路和再分发条件。
