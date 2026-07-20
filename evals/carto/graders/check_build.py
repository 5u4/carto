#!/usr/bin/env python3
import os
import sys
from pathlib import Path


def main() -> int:
    workspace = Path(os.environ.get("WAZA_WORKSPACE_DIR", "."))
    dist = workspace / "dist-site"
    if not dist.is_dir():
        print("dist-site/ not found: agent did not run `carto build`", file=sys.stderr)
        return 1

    html = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in dist.rglob("*.html"))
    if not html:
        print("no HTML rendered under dist-site/", file=sys.stderr)
        return 1

    problems = []
    for symbol in ("authorId", "buildFeed"):
        if symbol not in html:
            problems.append(f"built HTML missing source identifier `{symbol}` (docs did not describe the code)")
    if 'href="carto:' in html or "href='carto:" in html:
        problems.append("unresolved carto: link href in built HTML")

    if problems:
        for p in problems:
            print(p, file=sys.stderr)
        return 1

    print("carto build produced HTML with real source identifiers and resolved links")
    return 0


if __name__ == "__main__":
    sys.exit(main())
