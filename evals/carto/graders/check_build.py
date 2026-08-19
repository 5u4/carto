#!/usr/bin/env python3
import os
import sys
from pathlib import Path


def main() -> int:
    workspace = Path(os.environ.get("WAZA_WORKSPACE_DIR", "."))
    nodes_dir = workspace / ".carto" / "docs"
    node_files = sorted(nodes_dir.glob("*/node.json"))
    if not node_files:
        print("no Carto nodes found under .carto/docs/", file=sys.stderr)
        return 1
    for node_file in node_files:
        for locale in ("en", "zh"):
            page_file = node_file.with_name(f"{locale}.mdx")
            if not page_file.is_file():
                print(f"missing {locale} page beside {node_file.relative_to(workspace)}", file=sys.stderr)
                return 1
            if "flowchart LR" in page_file.read_text(encoding="utf-8"):
                print(f"generated page uses flowchart LR: {page_file.relative_to(workspace)}", file=sys.stderr)
                return 1

    dist = workspace / "dist-site"
    if not dist.is_dir():
        print("dist-site/ not found: agent did not run `carto build`", file=sys.stderr)
        return 1

    html = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in dist.rglob("*.html"))
    if not html:
        print("no HTML rendered under dist-site/", file=sys.stderr)
        return 1

    problems = []
    for symbol in ("TokenBucket", "sampleApiLimitTrace"):
        if symbol not in html:
            problems.append(f"built HTML missing source identifier `{symbol}` (docs did not describe the code)")
    if 'href="carto:' in html or "href='carto:" in html:
        problems.append("unresolved carto: link href in built HTML")

    if problems:
        for p in problems:
            print(p, file=sys.stderr)
        return 1

    print(".carto/docs nodes produced root dist-site HTML with real source identifiers and resolved links")
    return 0


if __name__ == "__main__":
    sys.exit(main())
