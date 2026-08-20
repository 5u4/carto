#!/usr/bin/env python3
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


LOCALES = ("en", "zh")
VIEW_TAGS = {"pre", "table", "figure", "dl", "ol", "ul"}
ROW_MARKER = "\n__CARTO_ROW__\n"
CELL_MARKER = " __CARTO_CELL__ "
EXPECTED_TRACE = [
    (1000, True, 1, 0),
    (1000, True, 0, 0),
    (1000, False, 0, 1000),
    (1500, False, 0, 500),
    (2000, True, 0, 0),
]


class RenderedContentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.pages = []
        self.current = None
        self.active_views = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "main":
            self.current = {"locale": attributes.get("lang", ""), "parts": [], "views": []}
            self.active_views = []
            return
        if self.current is None:
            return
        if tag in VIEW_TAGS:
            view = {"tag": tag, "parts": []}
            self.current["views"].append(view)
            self.active_views.append(view)
        if tag in {"tr", "li"}:
            self.append(ROW_MARKER)
        if tag in {"th", "td"}:
            self.append(CELL_MARKER)
        self.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if self.current is None:
            return
        if tag == "main":
            self.pages.append(self.current)
            self.current = None
            self.active_views = []
            return
        self.append(" ")
        if tag in VIEW_TAGS:
            for index in range(len(self.active_views) - 1, -1, -1):
                if self.active_views[index]["tag"] == tag:
                    del self.active_views[index]
                    break

    def handle_data(self, data: str) -> None:
        if self.current is not None:
            self.append(data)

    def append(self, text: str) -> None:
        self.current["parts"].append(text)
        for view in self.active_views:
            view["parts"].append(text)


def packed(text: str) -> str:
    return re.sub(r"\s+", "", text).lower()


def rendered_text(item: dict) -> str:
    return "".join(item["parts"])


def table_rows(text: str) -> list[list[str]]:
    rows = []
    for raw_row in text.split(ROW_MARKER):
        cells = [cell.strip() for cell in raw_row.split(CELL_MARKER)[1:]]
        if cells:
            rows.append(cells)
    return rows


def decision_rows_have_outcomes(rows: list[list[str]]) -> bool:
    field_aliases = {
        "allowed": ("allowed", "decision"),
        "remaining": ("remaining",),
        "retryafterms": ("retryafterms",),
    }
    for header_index, cells in enumerate(rows):
        headers = [packed(cell) for cell in cells]
        positions = {}
        for field, aliases in field_aliases.items():
            position = next(
                (index for index, header in enumerate(headers) if any(alias in header for alias in aliases)),
                None,
            )
            if position is None:
                break
            positions[field] = position
        if len(positions) != len(field_aliases):
            continue
        denied = False
        allowed = False
        has_condition = any("refilled<1" in header for header in headers)
        for values in rows[header_index + 1 :]:
            if any(position >= len(values) for position in positions.values()):
                continue
            compact_values = [packed(value) for value in values]
            has_condition = has_condition or any("refilled<1" in value for value in compact_values)
            outcome = compact_values[positions["allowed"]]
            remaining = compact_values[positions["remaining"]]
            retry = compact_values[positions["retryafterms"]]
            denied = denied or (
                "false" in outcome and "math.floor" in remaining and "math.ceil" in retry
            )
            allowed = allowed or (
                "true" in outcome and "math.floor" in remaining and re.search(r"\b0\b", retry) is not None
            )
        if has_condition and denied and allowed:
            return True
    return False


def table_has_decision_outcomes(text: str) -> bool:
    rows = table_rows(text)
    width = max((len(row) for row in rows), default=0)
    columns = [[row[index] if index < len(row) else "" for row in rows] for index in range(width)]
    return decision_rows_have_outcomes(rows) or decision_rows_have_outcomes(columns)


def outcome_segment(text: str, outcome: str) -> str:
    match = re.search(rf"allowed[^a-z0-9]*{outcome}", text)
    if match is None:
        return ""
    next_outcome = re.search(r"allowed[^a-z0-9]*(?:true|false)", text[match.end() :])
    end = match.end() + next_outcome.start() if next_outcome is not None else len(text)
    return text[match.start() : end]


def has_decision_fields(segment: str, retry: str) -> bool:
    return (
        re.search(r"remaining[^a-z0-9]*math\.floor", segment) is not None
        and re.search(rf"retryafterms[^a-z0-9]*{retry}", segment) is not None
    )


def is_token_bucket_decision_view(view: dict) -> bool:
    text = rendered_text(view)
    compact = packed(text)
    if "exportclasstokenbucket" in compact:
        return False
    required = (
        "refilled<1",
        "allowed",
        "remaining",
        "retryafterms",
        "math.floor",
        "math.ceil",
    )
    if not all(value in compact for value in required):
        return False
    if view["tag"] == "table":
        return table_has_decision_outcomes(text)
    denied = outcome_segment(compact, "false")
    allowed = outcome_segment(compact, "true")
    return has_decision_fields(denied, r"math\.ceil") and has_decision_fields(allowed, "0")


def labeled_record(text: str) -> tuple[int, bool, int, int] | None:
    patterns = {
        "at_ms": r"\batMs\b[\"']?\s*[:=]?\s*(\d+)",
        "allowed": r"\ballowed\b[\"']?\s*[:=]?\s*(true|false)\b",
        "remaining": r"\bremaining\b[\"']?\s*[:=]?\s*(\d+)",
        "retry": r"\bretryAfterMs\b[\"']?\s*[:=]?\s*(\d+)",
    }
    matches = {name: re.search(pattern, text, re.IGNORECASE) for name, pattern in patterns.items()}
    if not all(matches.values()):
        return None
    return (
        int(matches["at_ms"].group(1)),
        matches["allowed"].group(1).lower() == "true",
        int(matches["remaining"].group(1)),
        int(matches["retry"].group(1)),
    )


def labeled_trace_sequences(text: str) -> list[list[tuple[int, bool, int, int]]]:
    objects = [labeled_record(value) for value in re.findall(r"\{[^{}]*\}", text, re.DOTALL)]
    lines = [labeled_record(value) for value in re.split(rf"{ROW_MARKER}|\n", text)]
    return [
        [record for record in objects if record is not None],
        [record for record in lines if record is not None],
    ]


def table_trace_sequence(text: str) -> list[tuple[int, bool, int, int]]:
    rows = table_rows(text)
    fields = ("atms", "allowed", "remaining", "retryafterms")
    for header_index, cells in enumerate(rows):
        headers = [packed(cell) for cell in cells]
        if not all(any(field in header for header in headers) for field in fields):
            continue
        positions = {field: next(i for i, header in enumerate(headers) if field in header) for field in fields}
        records = []
        for values in rows[header_index + 1 :]:
            if any(position >= len(values) for position in positions.values()):
                continue
            number_values = {}
            for field in ("atms", "remaining", "retryafterms"):
                match = re.search(r"\b\d+\b", values[positions[field]])
                if match is None:
                    break
                number_values[field] = int(match.group())
            else:
                allowed = re.search(r"\b(true|false)\b", values[positions["allowed"]], re.IGNORECASE)
                if allowed is not None:
                    records.append(
                        (
                            number_values["atms"],
                            allowed.group().lower() == "true",
                            number_values["remaining"],
                            number_values["retryafterms"],
                        )
                    )
        return records
    return []


def column_trace_sequence(text: str) -> list[tuple[int, bool, int, int]]:
    lines = text.splitlines()
    fields = ("atms", "allowed", "remaining", "retryafterms")
    header_index = next(
        (index for index, line in enumerate(lines) if all(field in packed(line) for field in fields)),
        None,
    )
    if header_index is None:
        return []
    records = []
    for line in lines[header_index + 1 :]:
        values = line.split()
        if len(values) < 4 or not values[0].isdigit() or values[1].lower() not in {"true", "false"}:
            continue
        if not values[2].isdigit() or not values[3].isdigit():
            continue
        records.append((int(values[0]), values[1].lower() == "true", int(values[2]), int(values[3])))
    return records


def has_exact_trace_result(view: dict) -> bool:
    text = rendered_text(view)
    sequences = [*labeled_trace_sequences(text), column_trace_sequence(text)]
    if view["tag"] == "table":
        sequences.append(table_trace_sequence(text))
    return EXPECTED_TRACE in sequences


def parse_rendered_pages(html_files: list[Path], dist: Path) -> tuple[list[dict], str]:
    pages = []
    raw_documents = []
    for html_file in html_files:
        raw = html_file.read_text(encoding="utf-8", errors="ignore")
        raw_documents.append(raw)
        parser = RenderedContentParser()
        parser.feed(raw)
        for page in parser.pages:
            page["path"] = html_file.relative_to(dist).as_posix()
        pages.extend(parser.pages)
    return pages, "\n".join(raw_documents)


def locale_page_key(page: dict) -> str:
    parts = list(Path(page["path"]).parts)
    if page["locale"] != LOCALES[0] and parts and parts[0] == page["locale"]:
        parts = parts[1:]
    return "/".join(parts)


def obligation_signature(page: dict) -> list[tuple[int, str, str]]:
    signature = []
    has_trace_subject = "sampleapilimittrace" in packed(rendered_text(page))
    for index, view in enumerate(page["views"]):
        if is_token_bucket_decision_view(view):
            signature.append((index, "decision", view["tag"]))
        if has_trace_subject and has_exact_trace_result(view):
            signature.append((index, "trace", view["tag"]))
    return signature


def locale_signatures(pages: list[dict], locale: str) -> dict[str, list[tuple[int, str, str]]]:
    signatures = {}
    for page in pages:
        if page["locale"] != locale:
            continue
        signature = obligation_signature(page)
        if signature:
            signatures[locale_page_key(page)] = signature
    return signatures


def main() -> int:
    workspace = Path(os.environ.get("WAZA_WORKSPACE_DIR", "."))
    nodes_dir = workspace / ".carto" / "docs"
    node_files = sorted(nodes_dir.glob("*/node.json"))
    if not node_files:
        print("no Carto nodes found under .carto/docs/", file=sys.stderr)
        return 1
    for node_file in node_files:
        for locale in LOCALES:
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
    html_files = sorted(dist.rglob("*.html"))
    if not html_files:
        print("no HTML rendered under dist-site/", file=sys.stderr)
        return 1

    pages, raw_html = parse_rendered_pages(html_files, dist)
    problems = []
    for locale in LOCALES:
        localized_pages = [page for page in pages if page["locale"] == locale]
        if not localized_pages:
            problems.append(f"built HTML has no rendered `{locale}` main content")
            continue
        decision_reproduced = any(
            "tokenbucket" in packed(rendered_text(page))
            and any(is_token_bucket_decision_view(view) for view in page["views"])
            for page in localized_pages
        )
        if not decision_reproduced:
            problems.append(
                f"built `{locale}` HTML lacks a structural TokenBucket decision view with the verified branch and both outcomes"
            )
        trace_reproduced = any(
            "sampleapilimittrace" in packed(rendered_text(page))
            and any(has_exact_trace_result(view) for view in page["views"])
            for page in localized_pages
        )
        if not trace_reproduced:
            problems.append(
                f"built `{locale}` HTML lacks a rendered sampleApiLimitTrace result with the exact five-record output"
            )
    signatures = {locale: locale_signatures(pages, locale) for locale in LOCALES}
    if signatures[LOCALES[0]] != signatures[LOCALES[1]]:
        problems.append("rendered locales differ in required view kind, order, or explanatory page role")
    if 'href="carto:' in raw_html or "href='carto:" in raw_html:
        problems.append("unresolved carto: link href in built HTML")

    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        return 1

    print(".carto/docs rendered aligned locale views with verified TokenBucket decisions, the reproduced trace, and resolved links")
    return 0


if __name__ == "__main__":
    sys.exit(main())
