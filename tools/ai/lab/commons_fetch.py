"""Fetch candidate reference photos from Wikimedia Commons (free licences), 1024 px thumbnails + attribution metadata.
   python commons_fetch.py OUT_DIR   (subjects below; N candidates each)"""
import sys, os, json, re, time, urllib.request, urllib.parse

UA = "world-sim-sprite-research/0.1 (personal non-commercial research; python-urllib)"
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
N = 5
SUBJECTS = {
    "ruined_hut": "abandoned wooden house village Russia",
    "izba": "Russian wooden izba carved window frames",
    "kremlin_tower": "Spasskaya Tower Moscow Kremlin",
    "st_basil": "Saint Basil's Cathedral Moscow",
    "liberty": "Statue of Liberty New York",
    "pagoda": "five-storied pagoda Japan temple",
    "canal_house": "Amsterdam canal houses gables",
    "thatched_cottage": "thatched cottage England village",
    "khrushchevka": "Khrushchyovka five-storey apartment building",
    "santorini": "Oia Santorini white houses",
    "stave_church": "Borgund stave church",
    "painted_lady": "Painted Ladies Victorian houses San Francisco",
    "stalinist": "Kotelnicheskaya Embankment Building",
    "windmill": "Kinderdijk windmill",
}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=60).read()

meta = {}
for slug, q in SUBJECTS.items():
    params = {"action": "query", "format": "json", "generator": "search", "gsrsearch": f"{q} filetype:bitmap", "gsrnamespace": 6,
              "gsrlimit": 12, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1024}
    try:
        d = json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)))
    except Exception as e:
        print(slug, "search failed", e); continue
    pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    got = 0
    for p in pages:
        if got >= N: break
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg", "image/png") or ii.get("width", 0) < 900: continue
        em = ii.get("extmetadata", {})
        lic = em.get("LicenseShortName", {}).get("value", "")
        if not re.search(r"CC|Public domain|PD", lic, re.I): continue
        url = ii.get("thumburl") or ii["url"]
        fn = f"{slug}_{got}.jpg"
        try:
            open(os.path.join(OUT, fn), "wb").write(get(url))
        except Exception as e:
            print(slug, "download failed", e); continue
        artist = re.sub(r"<[^>]+>", "", em.get("Artist", {}).get("value", "")).strip()
        meta[fn] = {"subject": slug, "title": p["title"], "license": lic, "artist": artist, "page": ii.get("descriptionurl"), "src": url}
        got += 1
        time.sleep(0.5)
    print(f"{slug}: {got} files")
json.dump(meta, open(os.path.join(OUT, "attribution.json"), "w"), ensure_ascii=False, indent=1)
