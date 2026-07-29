# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas = [('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\index.html', 'app'), ('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\assets', 'app\\assets'), ('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\css', 'app\\css'), ('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\js', 'app\\js'), ('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\models', 'app\\models'), ('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\vendor', 'app\\vendor'), ('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\workers', 'app\\workers'), ('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\README.md', 'app'), ('C:\\Users\\hu\\Documents\\小工具-批量图片处理\\THIRD_PARTY_NOTICES.md', 'app')]
binaries = []
hiddenimports = []
tmp_ret = collect_all('webview')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['xiangxu_launcher.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='像序',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version='C:\\Users\\hu\\Documents\\小工具-批量图片处理\\packaging\\version_info.txt',
    icon=['C:\\Users\\hu\\Documents\\小工具-批量图片处理\\assets\\xiangxu.ico'],
)
