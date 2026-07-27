# 像序第三方许可说明

像序的浏览器端业务代码不依赖在线 CDN。源码仓库直接包含或引用以下组件：

- ONNX Runtime Web 1.27.0 — MIT License；以本地 CPU/WASM 最小运行时提供，用于可选 AI 抠图。
- PaddleSeg PP-MattingV2 STDC1 human 512 — Apache License 2.0；源码只保留来源、转换记录和许可证，不提交 ONNX 权重，完整许可见 `assets/models/PADDLESEG-LICENSE.txt`。
- U²-Net u2netp ONNX 权重 — Apache License 2.0；不随源码内置，仅在用户选择该模型并主动下载后使用，许可见 `assets/models/U2NET-LICENSE.txt`。

Windows 桌面封装还使用：

- Python 3.12 — Python Software Foundation License。
- PyInstaller 6.21 — GPL-2.0-or-later，并适用其 Bootloader Exception。
- pywebview 6.2.1 — BSD 3-Clause License。
- pythonnet / clr-loader — MIT License。
- Microsoft Edge WebView2 Runtime — 使用系统已安装的 Microsoft 运行时，不包含在本发布包内。

各组件版权归原作者所有。完整许可证可在对应组件的官方发行包与项目仓库中查阅。
