# -*- coding: utf-8 -*-
"""2026 H2 표준시장단가 PDF 텍스트 → standard_price_2026_H2.csv"""
import re
import csv
import sys
from pathlib import Path

PDF_TEXT = Path(r"c:\Users\7707f\Downloads\공고자료2026년하반기건설공사표준시장단가적용공종및단가.pdf")
OUT_CSV = Path(r"c:\Users\7707f\Downloads\standard_price_2026_H2.csv")

# 건축공사 대분류 → 플랫폼 cat
BUILDING_CAT_MAP = {
    "A": "가설공사",
    "D": "철근콘크리트공사",
    "E": "철골공사",
    "F": "조적공사",
    "G": "미장공사",
    "H": "방수공사",
    "I": "목공사",
    "J": "금속공사",
    "K": "지붕공사",
    "L": "창호유리공사",
    "M": "타일공사",
    "N": "칠공사",
    "O": "수장공사",
    "P": "부대공사",
}

# 토목공사 대분류 → 플랫폼 cat (건축과 문자 충돌 방지)
CIVIL_CAT_MAP = {
    "A": "가설공사",
    "C": "지반개량공사",
    "D": "토공사",
    "E": "현장타설콘크리트공사",
    "F": "프리캐스트콘크리트공사",
    "G": "관공사",
    "H": "배수공사",
    "I": "강구조공사",
    "J": "말뚝공사",
    "K": "교량공사",
    "L": "도로포장공사",
    "N": "터널공사",
    "O": "하천항만공사",
    "Q": "기타공사1",
    "R": "기타공사2",
}

UNIT_MAP = {
    "m2": "M2", "m3": "M3", "ton": "TON", "t": "TON",
    "nr(개소)": "EA", "nr": "EA", "개": "EA", "개소": "EA",
    "식": "EA", "hr": "HR", "h": "HR", "m": "M", "km": "KM",
    "kg": "KG", "l": "L", "ml": "ML", "cm": "CM", "mm": "MM",
    "대": "EA", "조": "SET", "본": "EA", "매": "EA",
}

CODE_RE = re.compile(r"^([A-Z]{2}[A-Z0-9]{2,}\.[0-9]{5,})\s")
DAEBUNRYU_RE = re.compile(r"대분류\s+([A-Z])\s+(.+)")
CHAPTER_RE = re.compile(r"제([234])장|<(토목|건축|기계)")
HEADER_RE = re.compile(r"공종코드\s+공종명칭")


def normalize_spaces(s: str) -> str:
    """PDF 추출 텍스트: 한글 사이 불필요 공백 제거"""
    s = re.sub(r"[ \t]+", " ", s.strip())
    # 한글 + 공백 + 한글 → 붙이기 (반복)
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"([\uac00-\ud7a3])\s+([\uac00-\ud7a3])", r"\1\2", s)
    return s.strip()


def normalize_unit(u: str) -> str:
    u = u.strip().lower()
    u = u.replace("㎡", "m2").replace("㎥", "m3")
    if u in UNIT_MAP:
        return UNIT_MAP[u]
    if u.startswith("nr"):
        return "EA"
    return u.upper()


def parse_labor_ratio(s: str) -> str:
    m = re.search(r"(\d+)\s*%", s)
    return m.group(1) if m else ""


def parse_price(s: str) -> int:
    s = re.sub(r"[^\d]", "", s)
    return int(s) if s else 0


def get_cat_map(chapter: str):
    if chapter == "건축":
        return BUILDING_CAT_MAP
    if chapter == "토목":
        return CIVIL_CAT_MAP
    return {}  # 기계설비: 대분류명 그대로


def map_cat(chapter: str, letter: str, raw_name: str) -> str:
    raw_name = normalize_spaces(raw_name)
    m = get_cat_map(chapter)
    if letter in m:
        return m[letter]
    # fallback: 대분류명에서 공백·특수문자 제거
    name = re.sub(r"[^0-9A-Za-z가-힣]", "", raw_name)
    return name or letter


def try_parse_row(line: str):
    """단일 행 파싱 시도. 성공 시 dict, 실패 시 None"""
    line = normalize_spaces(line)
    m = CODE_RE.match(line)
    if not m:
        return None
    code = m.group(1)
    rest = line[m.end():].strip()

    # 끝: 노무비율 % ... 단가 (역순)
    labor_m = re.search(r"(\d+)\s*%\s*$", rest)
    if not labor_m:
        return None
    labor = labor_m.group(1)
    rest2 = rest[: labor_m.start()].strip()

    # 단가: 마지막 쉼표 숫자
    price_m = re.search(r"([\d,]+)\s*$", rest2)
    if not price_m:
        return None
    price = parse_price(price_m.group(1))
    rest3 = rest2[: price_m.start()].strip()

    # 단위: 마지막 토큰 (알려진 단위)
    unit = None
    spec = rest3
    for u in sorted(UNIT_MAP.keys(), key=len, reverse=True):
        if rest3.lower().endswith(" " + u) or rest3.lower().endswith(u):
            idx = rest3.lower().rfind(u)
            unit = rest3[idx:].strip()
            spec = rest3[:idx].strip()
            break
    if not unit:
        parts = rest3.rsplit(" ", 1)
        if len(parts) == 2 and len(parts[1]) <= 12:
            spec, unit = parts[0].strip(), parts[1].strip()
        else:
            return None

    # spec 앞 = name (첫 토큰 또는 전체)
    # name은 spec 전까지 — 실제로 rest3 = name + spec + unit
    # 패턴: name spec unit — name과 spec 구분 어려움
    # PDF 단일행: "AA310.01010 강관비계 10m이하, 3개월이하 m2 26631 64%"
    # → name=강관비계, spec=10m이하, 3개월이하

    # 코드 직후 첫 단어/구가 name, 나머지 spec
    # 휴리스틱: spec에 숫자/단위/층/이하 포함
    tokens = rest3.split(" ")
    if len(tokens) == 1:
        name, spec_text = tokens[0], "-"
    else:
        # name은 첫 1~3 토큰 until we hit digit or T= or m이하
        name_parts = []
        spec_parts = []
        for i, tok in enumerate(tokens):
            if re.search(r"\d|T=|이하|이상|미만|초과|×|㎜|㎝|cm|mm|m2|m3|/", tok, re.I):
                spec_parts = tokens[i:]
                break
            name_parts.append(tok)
        else:
            name_parts = tokens[:1]
            spec_parts = tokens[1:] if len(tokens) > 1 else ["-"]
        name = " ".join(name_parts) if name_parts else tokens[0]
        spec_text = " ".join(spec_parts) if spec_parts else "-"

    spec_full = f"{name} ({spec_text})" if spec_text and spec_text != "-" else name
    if spec_text == "-" and name:
        spec_full = name

    return {
        "code": code,
        "name": name,
        "spec": spec_text,
        "spec_full": spec_full,
        "unit": normalize_unit(unit),
        "price": price,
        "labor_ratio": labor,
    }


def parse_multiline_rows(lines, start_idx, chapter, current_cat):
    """멀티라인 행 파싱"""
    rows = []
    i = start_idx
    n = len(lines)
    while i < n:
        raw = lines[i]
        line = normalize_spaces(raw)
        if not line or line.startswith("【") or line.startswith("■") or line.startswith("--"):
            break
        if HEADER_RE.search(line) or DAEBUNRYU_RE.search(line) or CHAPTER_RE.search(line):
            break
        if line.startswith("제") and "장" in line:
            break

        if CODE_RE.match(line):
            # 멀티라인: 코드행 + 이어지는 명칭/규격
            block = [line]
            j = i + 1
            while j < n:
                nxt = normalize_spaces(lines[j])
                if not nxt or CODE_RE.match(nxt) or nxt.startswith("【") or nxt.startswith("■"):
                    break
                if HEADER_RE.search(nxt) or DAEBUNRYU_RE.search(nxt):
                    break
                if re.search(r"[\d,]+\s+\d+\s*%\s*$", nxt):
                    block.append(nxt)
                    j += 1
                    break
                block.append(nxt)
                j += 1

            merged = " ".join(block)
            parsed = try_parse_row(merged)
            if not parsed and len(block) > 1:
                # 코드 + 후속줄 합성
                code_m = CODE_RE.match(block[0])
                if code_m:
                    tail = " ".join(block[1:])
                    merged2 = normalize_spaces(block[0] + " " + tail)
                    parsed = try_parse_row(merged2)
            if parsed and current_cat:
                parsed["cat"] = current_cat
                rows.append(parsed)
            i = j
            continue
        i += 1
    return rows, i


def main():
    if not PDF_TEXT.exists():
        print("PDF not found:", PDF_TEXT, file=sys.stderr)
        sys.exit(1)

    text = PDF_TEXT.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()

    chapter = "토목"
    current_letter = ""
    current_cat = ""
    all_rows = []
    seen_codes = set()

    i = 0
    while i < len(lines):
        raw = lines[i]
        line = normalize_spaces(raw)

        ch = CHAPTER_RE.search(line)
        if ch:
            if ch.group(2):
                chapter = ch.group(2)
            elif ch.group(1) == "2":
                chapter = "토목"
            elif ch.group(1) == "3":
                chapter = "건축"
            elif ch.group(1) == "4":
                chapter = "기계"
            i += 1
            continue

        dm = DAEBUNRYU_RE.search(line)
        if dm:
            current_letter = dm.group(1)
            raw_name = normalize_spaces(dm.group(2))
            current_cat = map_cat(chapter, current_letter, raw_name)
            i += 1
            continue

        if HEADER_RE.search(line):
            block_rows, i = parse_multiline_rows(lines, i + 1, chapter, current_cat)
            for r in block_rows:
                if r["code"] in seen_codes:
                    continue
                seen_codes.add(r["code"])
                all_rows.append(r)
            continue

        i += 1

    # CSV 출력
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "cat", "spec", "unit", "price", "labor_ratio", "version", "active"])
        for idx, r in enumerate(all_rows, 1):
            w.writerow([
                idx,
                r["cat"],
                r["spec_full"],
                r["unit"],
                r["price"],
                r["labor_ratio"],
                "2026-H2",
                "Y",
            ])

    print(f"OK: {len(all_rows)} rows -> {OUT_CSV}")
    # cat별 집계
    from collections import Counter
    c = Counter(r["cat"] for r in all_rows)
    for k, v in sorted(c.items(), key=lambda x: -x[1])[:20]:
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
