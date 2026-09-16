"""Regressão de layout do #music-video-anchor.

Este arquivo era uma SEGUNDA cópia do teste, em Python, com a cadeia de classes
do app duplicada à mão. Quando o layout de NowPlayingView.tsx mudou (quatro
ramagens responsivas por modo), a cópia ficou dessincronizada e o teste passou a
falhar contra si mesmo -- e havia duas versões para manter.

A fonte da verdade agora é uma só: e2e/podcast-video-anchor-bounds.spec.mjs, que
LÊ as classes do fonte e deriva as expectativas delas. Este .py apenas delega,
para continuar funcionando para quem já chama `python3 e2e/...`.

Executar: python3 e2e/podcast-video-anchor-bounds.spec.py
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, "e2e", "podcast-video-anchor-bounds.spec.mjs")

if __name__ == "__main__":
    sys.exit(subprocess.call(["node", SPEC], cwd=ROOT))
