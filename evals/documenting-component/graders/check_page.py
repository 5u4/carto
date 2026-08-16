from collections import Counter
import json
import os
import re
import sys
from pathlib import Path


IGNORED_PARTS = {".git", ".waza", "node_modules"}
EXPECTED_PAGES = {
    "behavioral": Path("docs/token-bucket.md"),
    "structural": Path("docs/job-lifecycle.md"),
    "migration": Path("docs/retry-policy-migration.md"),
}
REQUIRED_EVIDENCE = {
    "behavioral": {
        "src/rate-limit-contract.ts",
        "src/token-bucket.ts",
        "src/api-request-limiter.ts",
    },
    "structural": {"src/job-lifecycle.ts", "src/job-coordinator.ts"},
    "migration": {
        "legacy/retry-policy.ts",
        "legacy/report-worker.ts",
        "src/retry-policy.ts",
        "src/report-worker.ts",
    },
}
FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures"
ANCHOR_PATTERN = re.compile(
    r"((?:/|\./|(?:[A-Za-z0-9_@.-]+/)*)[A-Za-z0-9_@.-]+\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?"
)
FENCE_PATTERN = re.compile(r"```\s*([A-Za-z0-9_-]*)[^\n]*\n(.*?)```", re.DOTALL)


def relative_files(workspace: Path) -> list[Path]:
    return [
        path
        for path in workspace.rglob("*")
        if path.is_file()
        and not any(part in IGNORED_PARTS for part in path.relative_to(workspace).parts)
    ]


def validate_artifacts(
    workspace: Path, scenario: str, expected_page: Path
) -> tuple[str, list[str]]:
    problems = []
    files = relative_files(workspace)
    relative_paths = {path.relative_to(workspace) for path in files}
    expected_inputs = {Path(path) for path in REQUIRED_EVIDENCE[scenario]}
    expected_paths = expected_inputs | {expected_page}

    missing = sorted(expected_inputs - relative_paths)
    if missing:
        problems.append(
            "staged source files are missing: "
            + ", ".join(path.as_posix() for path in missing)
        )

    unexpected = sorted(relative_paths - expected_paths)
    if unexpected:
        problems.append(
            "the agent must author only the requested page; unexpected files: "
            + ", ".join(path.as_posix() for path in unexpected)
        )

    for relative in sorted(expected_inputs & relative_paths):
        baseline = FIXTURE_ROOT / relative
        actual = workspace / relative
        if not baseline.is_file() or actual.read_bytes() != baseline.read_bytes():
            problems.append(f"staged source file was modified: {relative.as_posix()}")

    page_path = workspace / expected_page
    if not page_path.is_file():
        problems.append(f"expected documentation page was not written: {expected_page.as_posix()}")
        return "", problems
    text = page_path.read_text(encoding="utf-8", errors="strict")
    prose = FENCE_PATTERN.sub("", text)
    prose = re.sub(r"`[^`]*`", "", prose)
    prose = re.sub(r"<(?:(?:https?|mailto):)[^>]+>", "", prose, flags=re.IGNORECASE)
    if re.search(r"(?i)<\/?[a-z][^>]*>", prose):
        problems.append("the page uses authored HTML or JSX instead of Markdown-native views")
    return text, problems


def validate_anchors(
    workspace: Path, text: str, required_paths: set[str]
) -> list[str]:
    problems = []
    anchored_paths = set()
    matches = list(ANCHOR_PATTERN.finditer(text))
    if not matches:
        return ["the page contains no path:line evidence anchors"]

    for match in matches:
        raw_path, start_text, end_text = match.groups()
        source_path = Path(raw_path)
        if source_path.is_absolute():
            problems.append(f"absolute evidence path is not allowed: {match.group(0)}")
            continue
        resolved = (workspace / source_path).resolve()
        try:
            relative = resolved.relative_to(workspace)
        except ValueError:
            problems.append(f"evidence path traverses outside the workspace: {match.group(0)}")
            continue
        relative_name = relative.as_posix()
        anchored_paths.add(relative_name)
        if not resolved.is_file():
            problems.append(f"evidence path does not exist: {match.group(0)}")
            continue
        line_count = len(resolved.read_text(encoding="utf-8", errors="strict").splitlines())
        start = int(start_text)
        end = int(end_text) if end_text else start
        if start < 1 or end < start or end > line_count:
            problems.append(
                f"evidence range is outside {relative_name}'s 1-{line_count} lines: {match.group(0)}"
            )

    missing = sorted(required_paths - anchored_paths)
    if missing:
        problems.append("missing cross-file evidence anchors for: " + ", ".join(missing))
    return problems


def require_patterns(text: str, patterns: dict[str, str]) -> list[str]:
    missing = [name for name, pattern in patterns.items() if not re.search(pattern, text)]
    if not missing:
        return []
    return ["page is missing fixture-specific facts: " + ", ".join(missing)]



def diff_blocks(text: str) -> list[str]:
    return [
        body
        for language, body in FENCE_PATTERN.findall(text)
        if language.lower() in {"diff", "patch"}
    ]



def presentation_view_count(text: str) -> int:
    fenced = len(FENCE_PATTERN.findall(text))
    tables = len(
        re.findall(
            r"(?m)^\s*\|[^\n]+\|\s*\n\s*\|(?:\s*:?-+:?\s*\|)+\s*$",
            text,
        )
    )
    return fenced + tables



def has_unified_diff(text: str) -> bool:
    return bool(
        diff_blocks(text)
        or re.search(r"(?m)^@@\s|^---\s+(?:a/|\S+\.(?:ts|js))|^\+\+\+\s+(?:b/|\S+\.(?:ts|js))", text)
    )


def fixture_trace(workspace: Path) -> list[dict[str, int | bool]]:
    source = (workspace / "src/api-request-limiter.ts").read_text(encoding="utf-8")
    capacity = int(re.search(r"capacity:\s*(\d+)", source).group(1))
    rate = int(re.search(r"refillTokensPerSecond:\s*(\d+)", source).group(1))
    started = int(re.search(r"startedAtMs:\s*(\d+)", source).group(1))
    times_text = re.search(r"TRACE_TIMES_MS\s*=\s*\[([^]]+)\]", source).group(1)
    times = [int(value) for value in re.findall(r"\d+", times_text)]
    tokens = float(capacity)
    updated = started
    trace = []
    for at_ms in times:
        tokens = min(capacity, tokens + ((at_ms - updated) / 1000) * rate)
        updated = at_ms
        if tokens < 1:
            retry_after = int(((1 - tokens) / rate) * 1000 + 0.999999999)
            trace.append(
                {
                    "atMs": at_ms,
                    "allowed": False,
                    "remaining": int(tokens),
                    "retryAfterMs": retry_after,
                }
            )
        else:
            tokens -= 1
            trace.append(
                {
                    "atMs": at_ms,
                    "allowed": True,
                    "remaining": int(tokens),
                    "retryAfterMs": 0,
                }
            )
    return trace


def contains_json_trace(text: str, expected: list[dict[str, int | bool]]) -> bool:
    for language, body in FENCE_PATTERN.findall(text):
        if language.lower() != "json":
            continue
        try:
            value = json.loads(body)
        except json.JSONDecodeError:
            continue
        if value == expected:
            return True
    return False


def parse_table_trace(text: str) -> list[list[dict[str, int | bool]]]:
    tables = []
    lines = text.splitlines()
    index = 0
    while index + 1 < len(lines):
        header = lines[index]
        separator = lines[index + 1]
        if not (
            re.match(r"^\s*\|.*\|\s*$", header)
            and re.match(r"^\s*\|(?:\s*:?-+:?\s*\|)+\s*$", separator)
        ):
            index += 1
            continue

        names = [
            re.sub(r"[^a-z0-9]", "", cell.lower())
            for cell in header.strip().strip("|").split("|")
        ]
        required = {"atms", "allowed", "remaining", "retryafterms"}
        if not required <= set(names):
            index += 2
            continue

        rows = []
        index += 2
        while index < len(lines) and re.match(r"^\s*\|.*\|\s*$", lines[index]):
            cells = [cell.strip().strip("`") for cell in lines[index].strip().strip("|").split("|")]
            if len(cells) != len(names):
                rows = []
                break
            values = dict(zip(names, cells))
            try:
                allowed = values["allowed"].lower()
                if allowed not in {"true", "false"}:
                    raise ValueError
                rows.append(
                    {
                        "atMs": int(values["atms"].replace(",", "").replace("_", "")),
                        "allowed": allowed == "true",
                        "remaining": int(values["remaining"].replace(",", "").replace("_", "")),
                        "retryAfterMs": int(values["retryafterms"].replace(",", "").replace("_", "")),
                    }
                )
            except ValueError:
                rows = []
                break
            index += 1
        if rows:
            tables.append(rows)
    return tables


def contains_row_trace(text: str, expected: list[dict[str, int | bool]]) -> bool:
    return any(rows == expected for rows in parse_table_trace(text))


def validate_behavioral(workspace: Path, text: str) -> list[str]:
    problems = require_patterns(
        text,
        {
            "RateLimitDecision": r"\bRateLimitDecision\b",
            "refillTokensPerSecond": r"\brefillTokensPerSecond\b",
            "retryAfterMs": r"\bretryAfterMs\b",
            "sampleApiLimitTrace": r"\bsampleApiLimitTrace\b",
            "allowApiRequest": r"\ballowApiRequest\b",
        },
    )
    if has_unified_diff(text):
        problems.append("a behavioral component page must not use a diff")
    views = presentation_view_count(text)
    if views != 1:
        problems.append(f"expected exactly one Markdown-native explanatory view; found {views}")
    expected = fixture_trace(workspace)
    if not contains_json_trace(text, expected) and not contains_row_trace(text, expected):
        problems.append(
            "the worked example does not reproduce every decision from sampleApiLimitTrace()"
        )
    return problems


def validate_structural(text: str) -> list[str]:
    problems = require_patterns(
        text,
        {
            "ALLOWED_JOB_TRANSITIONS": r"\bALLOWED_JOB_TRANSITIONS\b",
            "assertJobTransition": r"\bassertJobTransition\b",
            "isTerminalJobState": r"\bisTerminalJobState\b",
            "JobCoordinator": r"\bJobCoordinator\b",
            "queued state": r"\bqueued\b",
            "running state": r"\brunning\b",
            "succeeded state": r"\bsucceeded\b",
            "failed state": r"\bfailed\b",
        },
    )
    if has_unified_diff(text):
        problems.append("a structural component page must not use a diff")
    views = presentation_view_count(text)
    if views > 1:
        problems.append(f"expected at most one Markdown-native explanatory view; found {views}")
    return problems


def ordered_subset(values: list[str], sequence: list[str]) -> bool:
    position = 0
    for value in values:
        try:
            position = sequence.index(value, position) + 1
        except ValueError:
            return False
    return True


def validate_migration_diff(workspace: Path, text: str) -> list[str]:
    blocks = diff_blocks(text)
    if len(blocks) != 1:
        return [f"expected exactly one fenced diff; found {len(blocks)}"]

    old_lines = (workspace / "legacy/report-worker.ts").read_text(encoding="utf-8").splitlines()
    new_lines = (workspace / "src/report-worker.ts").read_text(encoding="utf-8").splitlines()
    actual = []
    problems = []
    for line in blocks[0].strip("\n").splitlines():
        if not line:
            continue
        if line.startswith(("@@", "---", "+++", "diff --git ", "index ")):
            continue
        if line[0] not in {" ", "+", "-"}:
            problems.append(f"diff contains an invalid line: {line}")
            continue
        actual.append(line)

    removed = [line[1:] for line in actual if line.startswith("-")]
    added = [line[1:] for line in actual if line.startswith("+")]
    context = [line[1:] for line in actual if line.startswith(" ")]
    required_removed = Counter(old_lines) - Counter(new_lines)
    required_added = Counter(new_lines) - Counter(old_lines)
    missing_removed = required_removed - Counter(removed)
    missing_added = required_added - Counter(added)
    if missing_removed or missing_added:
        problems.append("the caller diff omits staged report-worker changes")
    if not ordered_subset(removed, old_lines) or not ordered_subset(added, new_lines):
        problems.append("the caller diff reorders staged report-worker lines")
    invalid_removed = [line for line in removed if line not in old_lines]
    invalid_added = [line for line in added if line not in new_lines]
    invalid_context = [line for line in context if line not in old_lines and line not in new_lines]
    if invalid_removed or invalid_added or invalid_context:
        problems.append("the caller diff contains lines outside the staged report-worker files")

    remaining = re.sub(
        r"```\s*(?:diff|patch)[^\n]*\n.*?```",
        "",
        text,
        count=1,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if has_unified_diff(remaining):
        problems.append("the migration page contains more than one diff")
    views = presentation_view_count(text)
    if views != 1:
        problems.append(f"expected the diff to be the only Markdown-native explanatory view; found {views}")
    return problems

NUMBER_PATTERNS = {
    "500": r"(?<!\d)500(?!\d)",
    "750": r"(?<!\d)750(?!\d)",
    "12000": r"(?<!\d)(?:12[,_ ]?000|12\s*(?:s|seconds?))(?!\d)",
    "30000": r"(?<!\d)(?:30[,_ ]?000|30\s*(?:s|seconds?))(?!\d)",
}


def association_distance(text: str, name: str, first: str, second: str) -> int | None:
    positions = [
        [match.start() for match in re.finditer(pattern, text, re.IGNORECASE)]
        for pattern in (
            rf"\b{re.escape(name)}\b",
            NUMBER_PATTERNS[first],
            NUMBER_PATTERNS[second],
        )
    ]
    if any(not values for values in positions):
        return None
    distances = [
        max(name_pos, first_pos, second_pos) - min(name_pos, first_pos, second_pos)
        for name_pos in positions[0]
        for first_pos in positions[1]
        for second_pos in positions[2]
    ]
    return min(distances)


def policy_table_fact(text: str, name: str, base: str, cap: str) -> bool:
    lines = text.splitlines()
    for index in range(len(lines) - 1):
        if not (
            re.match(r"^\s*\|.*\|\s*$", lines[index])
            and re.match(r"^\s*\|(?:\s*:?-+:?\s*\|)+\s*$", lines[index + 1])
        ):
            continue
        headers = [cell.strip().strip("`") for cell in lines[index].strip().strip("|").split("|")]
        column = next(
            (position for position, header in enumerate(headers) if re.search(rf"\b{re.escape(name)}\b", header, re.IGNORECASE)),
            None,
        )
        if column is None:
            continue
        found_base = False
        found_cap = False
        row_index = index + 2
        while row_index < len(lines) and re.match(r"^\s*\|.*\|\s*$", lines[row_index]):
            cells = [cell.strip().strip("`") for cell in lines[row_index].strip().strip("|").split("|")]
            if len(cells) == len(headers):
                label = cells[0].lower()
                found_base = found_base or ("base" in label and bool(re.search(NUMBER_PATTERNS[base], cells[column])))
                found_cap = found_cap or (("cap" in label or "max" in label) and bool(re.search(NUMBER_PATTERNS[cap], cells[column])))
            row_index += 1
        if found_base and found_cap:
            return True
    return False


def implementation_fact(
    text: str,
    name: str,
    base: str,
    cap: str,
    wrong_base: str,
    wrong_cap: str,
) -> bool:
    if policy_table_fact(text, name, base, cap):
        return True
    prose = FENCE_PATTERN.sub("", text)
    normalized = re.sub(r"\s+", " ", prose)
    units = re.split(r"(?<=[.!?;])\s+|\b(?:while|whereas)\b", normalized)
    units += re.split(r"\n\s*\n", prose)
    units += [line for line in prose.splitlines() if line.strip().startswith(("|", "-", "*"))]
    for unit in units:
        correct = association_distance(unit, name, base, cap)
        wrong = association_distance(unit, name, wrong_base, wrong_cap)
        if correct is not None and correct <= 400 and (wrong is None or correct < wrong):
            return True
    return bool(re.search(NUMBER_PATTERNS[base], prose, re.IGNORECASE)) and bool(
        re.search(NUMBER_PATTERNS[cap], prose, re.IGNORECASE)
    )


def validate_migration(workspace: Path, text: str) -> list[str]:
    problems = require_patterns(
        text,
        {
            "retryDelay": r"\bretryDelay\b",
            "RetryPolicy": r"\bRetryPolicy\b",
            "DEFAULT_RETRY_POLICY": r"\bDEFAULT_RETRY_POLICY\b",
            "scheduleReportRetry": r"\bscheduleReportRetry\b",
        },
    )
    if not implementation_fact(text, "retryDelay", "500", "30000", "750", "12000"):
        problems.append("the page omits the legacy 500ms base or 30000ms cap")
    new_policy_fact = implementation_fact(
        text, "RetryPolicy", "750", "12000", "500", "30000"
    ) or implementation_fact(
        text, "DEFAULT_RETRY_POLICY", "750", "12000", "500", "30000"
    )
    if not new_policy_fact:
        problems.append("the page omits the new policy's 750ms base or 12000ms cap")
    problems.extend(validate_migration_diff(workspace, text))
    return problems


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in EXPECTED_PAGES:
        print("usage: check_page.py behavioral|structural|migration", file=sys.stderr)
        return 2

    scenario = sys.argv[1]
    workspace = Path(os.environ.get("WAZA_WORKSPACE_DIR", ".")).resolve()
    text, problems = validate_artifacts(workspace, scenario, EXPECTED_PAGES[scenario])
    if text:
        problems.extend(validate_anchors(workspace, text, REQUIRED_EVIDENCE[scenario]))
        if scenario == "behavioral":
            problems.extend(validate_behavioral(workspace, text))
        elif scenario == "structural":
            problems.extend(validate_structural(text))
        else:
            problems.extend(validate_migration(workspace, text))

    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1

    print(f"{scenario} component page satisfies artifact, evidence, and selection contracts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
