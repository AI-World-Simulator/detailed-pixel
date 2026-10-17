"""Experiment rounds for qexp.py (Qwen-Image-2.1)."""
STYLE = ("Hand-painted 2D game art sprite, cozy storybook illustration, rich but clean details, painterly textures, "
         "soft warm daylight from the upper left, gentle ambient occlusion, crisp readable silhouette")
ISO = "classic 2:1 isometric game view (orthographic camera looking 30 degrees down)"
ONLY = "Show only the building standing on a small patch of ground, no surroundings, no people, no cars, no text."

def edit_prompt(extra=""):
    return (f"Redraw the building from image 1 as a {STYLE}, in a {ISO}. Keep its architecture, proportions, materials, "
            f"colours and characteristic details exactly. {ONLY} {extra}").strip()

# reference subjects: file, noun used in prompts, short description (helps the model where the photo is ambiguous)
REFS = {
    "hut_ruined": ("building", "an abandoned, half-collapsed old wooden log house with a sagging roof"),
    "izba": ("building", "a Russian wooden village house (izba) with carved window frames"),
    "thatched_cottage": ("building", "an English cottage with a thick thatched roof"),
    "half_timbered": ("building", "a German half-timbered (Fachwerk) house"),
    "canal_house": ("building", "a narrow Amsterdam canal house with a decorated gable"),
    "khrushchevka": ("building", "a Soviet five-storey prefabricated apartment block (khrushchyovka)"),
    "painted_lady": ("building", "a colourful Victorian 'Painted Lady' townhouse from San Francisco"),
    "santorini": ("building", "a whitewashed Greek chapel with a blue dome from Santorini"),
    "windmill": ("building", "a traditional Dutch windmill"),
    "stave_church": ("building", "a Norwegian wooden stave church"),
    "pagoda": ("building", "a red Japanese five-storied pagoda"),
    "kremlin_tower": ("building", "the Spasskaya Tower of the Moscow Kremlin with its clock and red star"),
    "st_basil": ("building", "Saint Basil's Cathedral in Moscow with its colourful onion domes"),
    "stalinist": ("building", "a Stalinist 'Seven Sisters' high-rise from Moscow"),
    "liberty": ("monument", "the Statue of Liberty on its pedestal"),
}

def ref_prompt(key, extra=""):
    noun, desc = REFS[key]
    return (f"Redraw the {noun} from image 1 ({desc}) as a {STYLE}, in a {ISO}. Keep its architecture, proportions, materials, "
            f"colours and characteristic details. Isolate only the main {noun}: remove all trees, other buildings, outbuildings, "
            f"fences, vehicles, people and sky. Show the {noun} alone on a small patch of ground, no text. {extra}").strip()

COLS = {"q2": 5}
QROUNDS = {
    "q1": [
        dict(name="t2i izba RGBA", rgba=True, prompt=f"A traditional Russian wooden izba log house with carved window frames, a steep plank roof and a small porch. {STYLE}, {ISO}. {ONLY}"),
        dict(name="t2i izba grey bg", prompt=f"A traditional Russian wooden izba log house with carved window frames, a steep plank roof and a small porch. {STYLE}, {ISO}. {ONLY} Plain light grey background."),
        dict(name="edit izba RGBA cfg1", rgba=True, refs=["refs/izba.jpg"], prompt=edit_prompt()),
        dict(name="edit izba RGBA cfg4", rgba=True, refs=["refs/izba.jpg"], prompt=edit_prompt(), cfg=4.0),
    ],
}

QROUNDS["q2"] = [dict(name=f"ref {k}", rgba=True, refs=[f"refs/{k}.jpg"], prompt=ref_prompt(k)) for k in REFS]

# proxy stems per simple reference building (made by make_bproxies.sh)
BPROXY = {"izba": "gable_iso_t_izba", "thatched_cottage": "gable_iso_t_thatched", "half_timbered": "gable_iso_t_halftimber",
          "canal_house": "gable_iso_t_canal", "khrushchevka": "flat_iso_t_khrush", "painted_lady": "gable_iso_t_painted"}
BSHEET = {"izba": "izba", "thatched_cottage": "thatched", "half_timbered": "halftimber", "canal_house": "canal",
          "khrushchevka": "khrush", "painted_lady": "painted"}

def angle_prompt(key, guide="the block"):
    noun, desc = REFS[key]
    return (f"Draw the {noun} from image 1 ({desc}) as a {STYLE}. Image 2 is a layout guide: draw the {noun} with exactly the same "
            f"orientation, camera angle, position, size and proportions as {guide} in image 2; the dark brown door marks the main "
            f"entrance. Keep the architecture, materials, colours and characteristic details of image 1. Isolate only the main "
            f"{noun}: no trees, no other buildings, no outbuildings, no fences, no people, no text.")

def sheet_prompt(key, n=13):
    noun, desc = REFS[key]
    return (f"A turnaround sprite sheet: draw the {noun} from image 1 ({desc}) {n} times, once in each of the {n} orientations shown "
            f"by the blocks in image 2, with exactly the same positions, sizes, orientations and camera as the blocks; the dark "
            f"brown door marks the main entrance. Exactly the same {noun} in every view: identical architecture, materials, colours "
            f"and details, as a {STYLE}. Plain light grey background, no text, no labels.")

QROUNDS["q3"] = []
for k in ["izba", "canal_house", "half_timbered", "thatched_cottage"]:
    st = BPROXY[k]
    for a in (30, 60):
        QROUNDS["q3"].append(dict(name=f"{k} @{a} guide=colour", rgba=True, refs=[f"refs/{k}.jpg", f"p{a}_{st}_colorn.png"], prompt=angle_prompt(k, "the coloured block")))
    QROUNDS["q3"].append(dict(name=f"{k} @30 guide=lines", rgba=True, refs=[f"refs/{k}.jpg", f"p30_{st}_lines.png"], prompt=angle_prompt(k, "the white line drawing")))
COLS["q3"] = 3

QROUNDS["q4"] = [dict(name=f"sheet {k}", refs=[f"refs/{k}.jpg", f"sheet13_{BSHEET[k]}_colorn.png"], prompt=sheet_prompt(k), w=1920, h=1152)
                 for k in ["izba", "canal_house", "half_timbered", "khrushchevka"]]
COLS["q4"] = 2

def cn_prompt(key, sheet=False, n=13):
    noun, desc = REFS[key]
    if sheet:
        return (f"A turnaround sprite sheet of {n} views of the same {noun} from image 1 ({desc}), each view rotated a bit further, "
                f"as a {STYLE}, {ISO}. Exactly the same {noun} in every view: identical architecture, materials, colours and details. "
                f"Isolate only the {noun}, no trees, no other buildings, no fences, no people. Plain light grey background, no text.")
    return (f"The {noun} from image 1 ({desc}) as a {STYLE}, {ISO}. Keep its architecture, materials, colours and characteristic "
            f"details. Isolate only the main {noun}: no trees, no other buildings, no fences, no people. Plain light grey background, no text.")

QROUNDS["q5"] = []
for k in ["izba", "canal_house", "half_timbered", "thatched_cottage"]:
    st = BPROXY[k]
    QROUNDS["q5"] += [
        dict(name=f"{k} @30 CN lines s.7", refs=[f"refs/{k}.jpg"], ctrl=f"p30_{st}_lines.png", s=0.7, prompt=cn_prompt(k)),
        dict(name=f"{k} @30 CN linesW s.5 + init", refs=[f"refs/{k}.jpg"], ctrl=f"p30_{st}_linesw.png", s=0.5, e=0.8, init=f"p30_{st}_colorn.png", d=0.95, prompt=cn_prompt(k)),
    ]
COLS["q5"] = 4
QROUNDS["q6"] = [dict(name=f"SHEET {k} CN lines s.7", refs=[f"refs/{k}.jpg"], ctrl=f"sheet13_{BSHEET[k]}_lines.png", s=0.7, prompt=cn_prompt(k, True), w=1920, h=1152)
                 for k in ["izba", "canal_house", "half_timbered", "khrushchevka"]]
COLS["q6"] = 2

# description-only buildings (no reference photo)
DESC = {
    "machiya": "a traditional Kyoto machiya townhouse: dark wooden lattice facade, grey tiled roof with a small eave over the ground floor, noren curtain at the entrance",
    "swiss_chalet": "a Swiss alpine chalet: wide overhanging gable roof with stones, carved wooden balconies with red geraniums, white plaster ground floor",
    "moroccan_riad": "a Moroccan riad house: ochre clay walls, horseshoe-arched doorway with zellige tiles, small latticed windows, flat roof terrace with plants",
    "merchant_house": "a 19th-century Russian merchant house: two storeys, brick ground floor and wooden upper floor with carved window frames, green iron roof",
    "swedish_cottage": "a red Swedish falu cottage with white window trims and corners, black tiled gable roof and a small porch",
    "mexican_adobe": "a Mexican adobe house: thick rounded terracotta walls, wooden vigas sticking out under the flat roof, turquoise door, potted cacti",
    "chinese_teahouse": "a two-storey Chinese teahouse: red lacquered columns, upturned grey tiled eaves, carved wooden windows, red lanterns",
    "tuscan_villa": "a Tuscan villa: warm ochre stucco, terracotta hip roof, green wooden shutters, arched loggia and a cypress-free garden patch",
}
QROUNDS["q7"] = [dict(name=f"t2i {k}", rgba=True, prompt=f"{v.capitalize()}. {STYLE}, {ISO}. {ONLY}") for k, v in DESC.items()]
COLS["q7"] = 4

QROUNDS["q5b"] = []
for k in ["izba", "half_timbered"]:
    st = BPROXY[k]
    QROUNDS["q5b"] += [
        dict(name=f"{k} CN lines s1.0", refs=[f"refs/{k}.jpg"], ctrl=f"p30_{st}_lines.png", s=1.0, prompt=cn_prompt(k)),
        dict(name=f"{k} CN lines s1.4", refs=[f"refs/{k}.jpg"], ctrl=f"p30_{st}_lines.png", s=1.4, prompt=cn_prompt(k)),
        dict(name=f"{k} CN s1.0 + colour guide ref", refs=[f"refs/{k}.jpg", f"p30_{st}_colorn.png"], ctrl=f"p30_{st}_lines.png", s=1.0,
             prompt=cn_prompt(k) + " Image 2 shows the exact shape, orientation and position to follow."),
    ]
COLS["q5b"] = 3

def transform_prompt(key):
    noun, desc = REFS[key]
    return (f"Transform image 1: replace the simple coloured block with the real {noun} from image 2 ({desc}), keeping exactly the "
            f"block's shape, footprint, roof form, orientation, camera angle, position and size from image 1. Take the architecture "
            f"details, materials, colours and decorations from image 2. The dark brown door in image 1 marks the main entrance. "
            f"Render it as a {STYLE}. Isolate the {noun}: no trees, no other buildings, no fences, no people. Plain light grey background, no text.")

QROUNDS["q8"] = []
for k, a in [("izba", 30), ("half_timbered", 30), ("half_timbered", 60), ("canal_house", 30), ("thatched_cottage", 30), ("khrushchevka", 30)]:
    st = BPROXY[k]
    QROUNDS["q8"].append(dict(name=f"{k} @{a} proxy-first edit", refs=[f"p{a}_{st}_colorn.png", f"refs/{k}.jpg"], size="ref", prompt=transform_prompt(k)))
QROUNDS["q8"].append(dict(name="half_timbered @30 proxy-first + CN s.7", refs=[f"p30_{BPROXY['half_timbered']}_colorn.png", "refs/half_timbered.jpg"],
                          size="ref", ctrl=f"p30_{BPROXY['half_timbered']}_lines.png", s=0.7, prompt=transform_prompt("half_timbered")))
COLS["q8"] = 4

QROUNDS["q9"] = []
for k in ["izba", "half_timbered", "canal_house", "thatched_cottage"]:
    st = BPROXY[k]
    QROUNDS["q9"].append(dict(name=f"{k} @30 proxy+photo+STYLE", refs=[f"p30_{st}_colorn.png", f"refs/{k}.jpg", "style_izba.png"], size="ref",
        prompt=transform_prompt(k) + " Paint it exactly in the art style of image 3: the same brushwork, warm colour palette, level of detail, "
               "soft lighting and cozy storybook look, but keep the building itself from image 2 and the shape from image 1."))
COLS["q9"] = 4

def sheet_transform_prompt(key, style=True, n=13):
    noun, desc = REFS[key]
    p = (f"Transform image 1, a turnaround sheet of {n} simple coloured blocks: replace every block with the real {noun} from image 2 "
         f"({desc}), keeping exactly each block's shape, roof form, orientation, position and size. Exactly the same {noun} in every "
         f"view: identical architecture, materials, colours and decorations taken from image 2. The dark brown door marks the main "
         f"entrance. Render as a {STYLE}. Only the {noun}s, no trees, no fences, no people. Plain light grey background, no text.")
    if style:
        p += " Paint everything in the art style of image 3: same brushwork, warm palette, level of detail and soft lighting."
    return p

QROUNDS["q10"] = [dict(name=f"SHEET {k} proxy-first+photo+style", refs=[f"sheet13_{BSHEET[k]}_colorn.png", f"refs/{k}.jpg", "style_izba.png"],
                       size="ref", res=1504, prompt=sheet_transform_prompt(k)) for k in ["izba", "canal_house"]]
COLS["q10"] = 1

QROUNDS["q2L"] = [dict(name=f"landmark {k}", rgba=True, refs=[f"refs/{k}.jpg"], prompt=ref_prompt(k))
                  for k in ["kremlin_tower", "st_basil", "liberty", "pagoda", "windmill"]]
COLS["q2L"] = 5
QROUNDS["q7L"] = [dict(name=f"t2i {k}", rgba=True, prompt=f"{DESC[k].capitalize()}. {STYLE}, {ISO}. {ONLY}")
                  for k in ["machiya", "swiss_chalet", "moroccan_riad", "merchant_house"]]
COLS["q7L"] = 4

# q9 showed that a style image as a reference gets COPIED (object and all), so q10 runs without it
QROUNDS["q10"] = [dict(name=f"SHEET {k} proxy-first+photo", refs=[f"sheet13_{BSHEET[k]}_colorn.png", f"refs/{k}.jpg"],
                       size="ref", res=1504, prompt=sheet_transform_prompt(k, style=False)) for k in ["izba", "canal_house"]]

QROUNDS["q2M"] = [dict(name=f"ref {k}", rgba=True, refs=[f"refs/{k}.jpg"], prompt=ref_prompt(k))
                  for k in ["hut_ruined", "stave_church", "stalinist", "santorini", "painted_lady"]]
COLS["q2M"] = 5

# ---- Q1 test (2026-10-17): can Qwen alone replace the Qwen -> Z-Image chain? ----
APT = ("a five-storey 19th-century European apartment house: hipped terracotta roof with chimneys and small dormers, cream stucco "
       "facade with a rusticated ground floor, tall white-framed windows with flower boxes, ornate cornice, arched wooden entrance door")
RICH = ("Add rich architectural detail everywhere: window frames and sills, mouldings, cornices, individual roof tiles, chimneys, "
        "subtle weathering and texture. Give it depth, light and shadow, not a flat look.")
def pf_text(desc, n=None):
    what = f"Transform image 1, a turnaround sheet of {n} simple coloured blocks: replace every block with the same {desc}" if n else \
           f"Transform image 1: replace the simple coloured block with {desc}"
    return (f"{what}, keeping exactly the block's shape, footprint, roof form, orientation, camera angle, position and size. "
            f"The dark brown door marks the main entrance. {RICH} Render it as a {STYLE}. "
            + ("Exactly the same building in every view. " if n else "") + "Plain light grey background, no text.")
CN_T2I = f"{APT[0].upper() + APT[1:]}. {RICH} {STYLE}, {ISO}. Isolate only the building. Plain light grey background, no text."
HT = "half_timbered"
QROUNDS["qa"] = [
    dict(name="A1 qwen proxy-first, text only", refs=["p30_iso_colorn.png"], size="ref", prompt=pf_text(APT)),
    dict(name="A2 qwen proxy-first + CN lines .7", refs=["p30_iso_colorn.png"], size="ref", ctrl="p30_iso_lines.png", s=0.7, prompt=pf_text(APT)),
    dict(name="A3 qwen CN lines 1.0", ctrl="p30_iso_lines.png", s=1.0, prompt=CN_T2I),
    dict(name="A4 qwen CN lines 1.4", ctrl="p30_iso_lines.png", s=1.4, prompt=CN_T2I),
    dict(name="A5 qwen img2img d.93", init="p30_iso_colorn.png", d=0.93, prompt=CN_T2I),
    dict(name="B1 qwen proxy-first + photo, rich", refs=[f"p30_{BPROXY[HT]}_colorn.png", f"refs/{HT}.jpg"], size="ref",
         prompt=transform_prompt(HT) + " " + RICH),
    dict(name="B2 qwen proxy-first + photo + CN .7, rich", refs=[f"p30_{BPROXY[HT]}_colorn.png", f"refs/{HT}.jpg"], size="ref",
         ctrl=f"p30_{BPROXY[HT]}_lines.png", s=0.7, prompt=transform_prompt(HT) + " " + RICH),
]
COLS["qa"] = 4
QROUNDS["qa_sheet"] = [dict(name="C1 qwen proxy-first SHEET 7 views, text only", refs=["sheet7t_colorn.png"], size="ref", res=1440,
                            prompt=pf_text(APT.replace("five-storey", "five-storey (five rows of windows)"), n=7))]
COLS["qa_sheet"] = 1

# camera pitch test for Qwen: proxy-first edit at 30 vs 55 deg; a landmark asked for a steep view in words
QROUNDS["qp"] = [dict(name=f"qwen pitch {pt} @30", refs=[f"p30_iso_t_apt{pt}_colorn.png"], size="ref", prompt=pf_text(APT)) for pt in (30, 55)] + [
    dict(name="st_basil steep view (prompt)", rgba=True, refs=["refs/st_basil.jpg"],
         prompt=ref_prompt("st_basil").replace(ISO, "a steep top-down game view, orthographic camera looking down at about 55 degrees, so the roofs and the ground around are clearly visible"))]
COLS["qp"] = 3

# ---- clay style (2026-10-17): Codex plasticine image as the style reference; image 1 = proxy keeps the composition ----
CLAYQ = ("handmade plasticine claymation miniature: smooth matte modelling-clay walls, raised cream clay window surrounds, cornice and "
         "corner quoins, dark glass windows with brown clay frames, a clay roof with raised standing seams, a small clay chimney, soft rounded "
         "edges, subtle fingerprints, soft diffuse studio light, a stop-motion set miniature")
def clay_prompt(desc, ref=True, n=None):
    what = (f"Transform image 1, a turnaround sheet of {n} simple coloured blocks: replace every block with the same {desc}" if n else
            f"Transform image 1: replace the simple coloured block with {desc}")
    p = (f"{what}, keeping exactly the block's shape, footprint, roof form, orientation, camera angle, position and size, and its colours. "
         f"The dark brown door marks the main entrance. Make it a {CLAYQ}. ")
    if ref: p += ("Copy the material, modelling style, colours, window design and level of detail exactly from the clay house in image 2, "
                  "but take the shape, size, number of floors and view angle only from image 1. ")
    return p + ("Exactly the same building in every view. " if n else "") + "Plain light grey background, no text."
MSKD = "a four-storey 19th-century Moscow townhouse (four rows of windows)"
QROUNDS["qclay"] = [
    dict(name="Q clay proxy+STYLE ref + CN .7", refs=["p30_iso_t_msk_colorn.png", "style_clay.png"], size="ref",
         ctrl="p30_iso_t_msk_lines.png", s=0.7, prompt=clay_prompt(MSKD)),
    dict(name="Q clay proxy, text only + CN .7", refs=["p30_iso_t_msk_colorn.png"], size="ref",
         ctrl="p30_iso_t_msk_lines.png", s=0.7, prompt=clay_prompt(MSKD, ref=False)),
]
COLS["qclay"] = 2
