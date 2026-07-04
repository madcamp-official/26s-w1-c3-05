"""liberty 스타일을 모뉴먼트 밸리 풍 파스텔 스타일로 변환.

실행: python3 scripts/make_monument_style.py  (프로젝트 루트에서)
결과: public/monument-style.json 을 덮어씀 → 브라우저 새로고침하면 반영
색을 바꾸고 싶으면 아래 팔레트 값만 수정하면 됨.
"""
import json, re, urllib.request
from pathlib import Path

SRC_URL = "https://tiles.openfreemap.org/styles/liberty"
OUT = Path(__file__).parent.parent / "public" / "monument-style.json"

# Monument Valley 팔레트
TEAL = "#5ec9b7"        # 물 (청록)
TEAL_DEEP = "#4dbcaa"   # 강
GREEN = "#a9df8e"       # 잔디 (연잎 초록)
WOOD = "#8fd07f"        # 숲
CREAM_BG = GREEN        # 바탕도 초록으로 통일 (틈새마다 크림색 비치는 것 방지)
LAND = GREEN            # 부지(주차장 등)도 잔디와 같은 초록으로 통일
ROAD = "#ffffff"        # 길 (초록 배경 위에서 확실히 튀도록 흰색)
ROAD_CASING = "#f2a65a" # 길 테두리 (주황빛으로 대비를 줘서 도드라지게)
LINE_MISC = "#e3d4b2"   # 기타 선

# 도로가 초록 배경에 묻히지 않도록 최소 굵기를 보장
ROAD_WIDTH = ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 7]
ROAD_CASING_WIDTH = ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 9]

# 큰 도로(고속도로/간선도로)만 남기고 골목길·인도·철길 등은 통째로 제거
MAJOR_ROAD = re.compile(r"motorway|trunk|primary|secondary|tertiary|minor|service")
MINOR_ROAD_GROUPS = ("road_", "bridge_", "tunnel_", "aeroway_")

# User-Agent가 없으면 서버가 403으로 거부함
req = urllib.request.Request(SRC_URL, headers={"User-Agent": "kaist-map-style-builder"})
style = json.load(urllib.request.urlopen(req))
style["name"] = "Monument Pastel"

kept = []
building_added = False
for l in style["layers"]:
    t = l.get("type")
    sl = l.get("source-layer", "")
    lid = l["id"]

    # 글자·아이콘 레이어는 전부 제거
    if t == "symbol":
        continue

    # 골목길·인도·철길 등 작은 도로는 아예 그리지 않음 (큰 도로만 남김)
    if lid.startswith(MINOR_ROAD_GROUPS) and not MAJOR_ROAD.search(lid):
        continue

    # 도로 윤곽선(casing) 레이어는 통째로 제거 → 테두리 없는 깔끔한 길
    if "casing" in lid:
        continue

    # 건물 자리를 잔디와 완전히 똑같이 보이게 만듦.
    # (3D 돌출은 높이 0이라도 미세한 음영이 남으므로 평면 fill로 그려 잔디와 동일하게)
    if sl == "building":
        if building_added:
            continue
        building_added = True
        kept.append({
            "id": "buildings-3d",
            "type": "fill",
            "source": "openmaptiles",
            "source-layer": "building",
            "minzoom": 14,
            "paint": {
                "fill-color": GREEN,
                "fill-outline-color": GREEN,
                "fill-antialias": False,
            },
        })
        continue

    paint = l.setdefault("paint", {})

    if t == "background":
        paint.pop("background-pattern", None)
        paint["background-color"] = CREAM_BG

    elif t == "fill":
        paint.pop("fill-pattern", None)
        if sl == "water":
            c = TEAL
        elif re.search(r"grass|park|garden|pitch|golf|cemetery|green", lid):
            c = GREEN
        elif re.search(r"wood|forest|scrub", lid):
            c = WOOD
        else:
            c = LAND
        paint["fill-color"] = c
        paint["fill-outline-color"] = c
        paint.pop("fill-opacity", None)

    elif t == "line":
        paint.pop("line-pattern", None)
        if sl == "waterway":
            c = TEAL_DEEP
        elif "casing" in lid:
            c = ROAD_CASING
            paint["line-width"] = ROAD_CASING_WIDTH
        elif sl == "transportation":
            c = ROAD
            paint["line-width"] = ROAD_WIDTH
        else:
            c = LINE_MISC
        paint["line-color"] = c

    kept.append(l)

style["layers"] = kept
OUT.write_text(json.dumps(style, ensure_ascii=False, indent=1))
print(f"완료: {len(kept)}개 레이어 저장 → {OUT}")
