#!/usr/bin/env python3
import os
import re
import sys
from pathlib import Path


def main() -> int:
    workspace = Path(os.environ.get("WAZA_WORKSPACE_DIR", "."))
    pages = list(workspace.rglob("*.mdx")) + list(workspace.rglob("*.md"))
    pages = [p for p in pages if "fixtures" not in p.parts and "node_modules" not in p.parts]
    if not pages:
        print("no documentation page (.md/.mdx) was written", file=sys.stderr)
        return 1

    text = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in pages)

    problems = []
    if not re.search(r"token-bucket\.ts:\d+", text):
        problems.append("no `path:line` code anchor pointing at token-bucket.ts (the floor requires one per load-bearing claim)")
    if not re.search(r"(?i)token\s*bucket|tokenbucket", text):
        problems.append("page does not name the TokenBucket component")
    if not re.search(r"(?i)refill|capacity|rate.?limit", text):
        problems.append("page does not explain the component's mental model (refill/capacity/rate-limit)")

    if problems:
        for p in problems:
            print(p, file=sys.stderr)
        return 1

    print("component page names the component, explains its mental model, and carries a path:line anchor")
    return 0


if __name__ == "__main__":
    sys.exit(main())
