import json, os, pathlib, sys, urllib.parse, urllib.request

API_KEY = os.environ.get("PEXELS_API_KEY", "").strip()
if not API_KEY:
    raise SystemExit("PEXELS_API_KEY is not configured")

QUERIES = sys.argv[1:] or [
    "football stadium night",
    "football training",
    "football fans stadium",
    "soccer goalkeeper",
    "soccer goal celebration",
]

out_dir = pathlib.Path("sauron-video/output/pexels-test")
out_dir.mkdir(parents=True, exist_ok=True)
manifest = {"provider": "Pexels", "queries": [], "videos": []}
seen = set()

for query in QUERIES:
    url = "https://api.pexels.com/videos/search?" + urllib.parse.urlencode({
        "query": query,
        "per_page": 5,
        "orientation": "portrait",
        "size": "medium",
    })
    req = urllib.request.Request(url, headers={"Authorization": API_KEY, "User-Agent": "SauronVideoFactory/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    manifest["queries"].append({"query": query, "total_results": data.get("total_results", 0)})
    for v in data.get("videos", []):
        if v.get("id") in seen:
            continue
        seen.add(v.get("id"))
        files = [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4"]
        if not files:
            continue
        portrait = [f for f in files if (f.get("height") or 0) > (f.get("width") or 0)]
        candidates = portrait or files
        best = min(candidates, key=lambda f: abs((f.get("height") or 0) - 1280) + abs((f.get("width") or 0) - 720))
        manifest["videos"].append({
            "query": query,
            "id": v.get("id"),
            "duration": v.get("duration"),
            "width": v.get("width"),
            "height": v.get("height"),
            "pexels_url": v.get("url"),
            "creator": (v.get("user") or {}).get("name"),
            "download_url": best.get("link"),
            "file_width": best.get("width"),
            "file_height": best.get("height"),
        })

manifest["videos"] = manifest["videos"][:12]
path = out_dir / "manifest.json"
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"PEXELS_OK videos={len(manifest['videos'])} manifest={path}")
