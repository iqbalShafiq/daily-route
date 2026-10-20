#!/usr/bin/env python3
"""Build research/data/rail-jakarta.json from the harvested station facts.

Inputs (cached in /tmp):
  /tmp/mrt_stations.json   id.wikipedia MRT station articles
  /tmp/lrt_stations.json   id.wikipedia LRT Jakarta + LRT Jabodebek station articles
  /tmp/krl_stations.json   id.wikipedia KRL station articles
"""
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "rail-jakarta.json")

mrt = {r["title"]: r for r in json.load(open("/tmp/mrt_stations.json"))}
lrt = {r["title"]: r for r in json.load(open("/tmp/lrt_stations.json"))}
krl = {r["title"]: r for r in json.load(open("/tmp/krl_stations.json"))}
# supplementary single-station harvests
for extra in ("/tmp/kf.json", "/tmp/mf.json"):
    if os.path.exists(extra):
        for r in json.load(open(extra)):
            (mrt if "MRT" in r["title"] else krl).setdefault(r["title"], r)


# Explicit coordinate overrides where the wiki carries a demonstrable copy-paste
# error. Values verified against OpenStreetMap via the Nominatim geocoder.
COORD_OVERRIDES = {
    # id.wikipedia gives both LRT Jakarta stations the identical {{coord}} and the
    # identical address; OSM distinguishes them (RW 08 vs RW 06, Kayu Putih).
    "Stasiun LRT Pulomas": (-6.177311, 106.893393),
    "Stasiun LRT Equestrian": (-6.183553, 106.891354),
}


TITLE_ALIASES = {
    # id.wikipedia redirects "Stasiun LRT Taman Mini" to "Stasiun LRT TMII"
    "Stasiun LRT Taman Mini": "Stasiun LRT TMII",
}


# Operator-published display names that differ from the Wikipedia article title.
DISPLAY_NAME_OVERRIDES = {
    "Stasiun LRT Dukuh Atas Bank Syariah Indonesia": "Dukuh Atas",
}


def pick(pool, title, code=None, note=""):
    """Return a schema-shaped station dict, pulling code/coords from harvested data."""
    rec = pool.get(title) or {}
    if not rec.get("coords") and TITLE_ALIASES.get(title):
        rec = pool.get(TITLE_ALIASES[title]) or rec
    if title in COORD_OVERRIDES:
        rec = dict(rec, coords=list(COORD_OVERRIDES[title]))
    coords = rec.get("coords")
    lat = lon = None
    if coords:
        lat, lon = coords
    raw = rec.get("kode")
    use_code = code
    if use_code is None and raw:
        # harvested values look like "S-11, MGI" or "NS21, LBB"
        parts = [p.strip() for p in str(raw).split(",")]
        use_code = parts[-1] if len(parts) > 1 else parts[0]
    return {
        "name": DISPLAY_NAME_OVERRIDES.get(title, title.replace("Stasiun LRT ", "").replace("Stasiun MRT ", "").replace("Stasiun ", "")),
        "code": use_code,
        "latitude": lat,
        "longitude": lon,
        "note": note,
    }


# ---------------------------------------------------------------- MRT Jakarta
MRT_NS = [
    ("Stasiun MRT Lebak Bulus Bank Syariah Indonesia", "LBB",
     "Phase 1, elevated, 2 side platforms. Southern terminus and MRT Jakarta depot/offices. "
     "Interchange: Transjakarta Corridor 8 (Lebak Bulus); Transjabodetabek S21, S22, D21, D41; Lebak Bulus bus terminal. "
     "id.wikipedia code field 'NS21, LBB'."),
    ("Stasiun MRT Fatmawati Indomaret", "FTM",
     "Phase 1, elevated, 2 side platforms. Interchange: planned MRT Outer Ring Line; Transjabodetabek D21, D41. "
     "id.wikipedia code field 'NS20, FTM'."),
    ("Stasiun MRT Cipete Raya Tuku", "CPR",
     "Phase 1, elevated, 2 side platforms. id.wikipedia code field 'NS19, CPR'."),
    ("Stasiun MRT Haji Nawi", "HJN",
     "Phase 1, elevated, 2 side platforms. id.wikipedia code field 'NS18, HJN'."),
    ("Stasiun MRT Blok A Visa", "BLA",
     "Phase 1, elevated, 2 side platforms. TOD integrated with Pasar Blok A. id.wikipedia code field 'NS17, BLA'."),
    ("Stasiun MRT Blok M BCA", "BLM",
     "Phase 1, elevated; the only MRT station with 3 tracks / 2 island platforms. "
     "Interchange: Transjakarta Corridor 1 (Blok M); Transjabodetabek P11, S21, S61, SH2, T31; Blok M bus terminal. "
     "id.wikipedia code field 'NS16, BLM'."),
    ("Stasiun MRT ASEAN Headquarters", "SSM",
     "Phase 1, elevated, 2 side platforms. Originally named 'Sisingamangaraja'. "
     "Interchange: Transjakarta Corridor 1 (ASEAN /astes Agung); CSW transport hub (CSW 1); Transjabodetabek P11, S61, T31. "
     "id.wikipedia code field 'NS15, SSM'."),
    ("Stasiun MRT Senayan Mastercard", "SNY",
     "Phase 1, underground, single island platform. First underground station; elevated/underground transition is between ASEAN and Senayan. "
     "Interchange: Transjakarta Corridor 1 (Bundaran Senayan, Senayan Bank Jakarta); Transjabodetabek S61, SH2, T31. "
     "id.wikipedia code field 'NS14, SNY'."),
    ("Stasiun MRT Istora Mandiri", "IST",
     "Phase 1, underground, single island platform. Interchange: Transjakarta Corridor 1 (Polda Metro Jaya, Senayan Bank Jakarta). "
     "id.wikipedia code field 'NS13, IST'."),
    ("Stasiun MRT Bendungan Hilir", "BNH",
     "Phase 1, underground, single island platform. Interchange: Transjakarta Corridor 1 (Bendungan Hilir, Karet). "
     "id.wikipedia code field 'NS12, BNH'."),
    ("Stasiun MRT Setiabudi Astra", "STB",
     "Phase 1, underground, single island platform. id.wikipedia code field 'NS11, STB'."),
    ("Stasiun MRT Dukuh Atas BNI", "DKA",
     "Phase 1, underground, single island platform. Dukuh Atas TOD. Interchange: KRL Commuter Line (BNI City and Sudirman stations), "
     "Soekarno-Hatta Airport Rail Link (BNI City), LRT Jakarta and LRT Jabodebek (Dukuh Atas LRT station), "
     "Transjakarta Corridor 1 (Dukuh Atas), Corridor 4 and 6 (Galunggung). id.wikipedia code field 'NS10, DKA'."),
    ("Stasiun MRT Bundaran HI Bank Jakarta", "BHI",
     "Phase 1, underground, single island platform; northern terminus of the operating line. "
     "Directly integrated with the Transjakarta Bundaran HI Astra BRT station (stairs only - not wheelchair accessible). "
     "id.wikipedia code field 'NS09, BHI'. Named 'Bundaran Hotel Indonesia' until the 2024 Bank DKI naming-rights deal; "
     "renamed 'Bundaran HI Bank Jakarta' in July 2025 after Bank DKI rebranded to Bank Jakarta."),
    # ---- Phase 2A (under construction) ----
    ("Thamrin station (Jakarta MRT)", None,
     "Phase 2A, underground (planned). Interchange with the East-West Line and Transjakarta Corridor 1 (Kebon Sirih). "
     "No id.wikipedia station article and no verified coordinates; official MRT Jakarta Phase 2A page lists Thamrin first. "
     "Target opening: 2027 (segment 1)."),
    ("Stasiun MRT Monumen Nasional", None,
     "Phase 2A, underground (planned); located inside the National Monument complex. "
     "Interchange: Transjakarta Corridors 1, 2 and 3 (Monumen Nasional). Official MRT Jakarta names it 'Monas'. "
     "No code or verified coordinates published yet."),
    ("Stasiun MRT Harmoni", None,
     "Phase 2A, underground (planned). Interchange: Transjakarta Corridor 1 (Harmoni). No code published yet."),
    ("Stasiun MRT Sawah Besar", None,
     "Phase 2A, underground (planned). Interchange: Transjakarta Corridor 1 (Sawah Besar). No code published yet."),
    ("Stasiun MRT Mangga Besar", None,
     "Phase 2A, underground (planned). Interchange: Transjakarta Corridor 1 (Mangga Besar). No code published yet."),
    ("Stasiun MRT Glodok", None,
     "Phase 2A, underground (planned). Interchange: Transjakarta Corridor 1 (Glodok). No code published yet."),
    ("Stasiun MRT Kota", None,
     "Phase 2A, underground (planned); terminus of Phase 2A. Interchange: KRL Commuter Line Bogor and Tanjung Priok lines "
     "(Jakarta Kota station), Transjakarta Corridors 1 and 12 (Kota). No code published yet."),
    # ---- Phase 2B (planned) ----
    ("Stasiun MRT Mangga Dua", None,
     "Phase 2B, underground (planned). Interchange: KRL Commuter Line Tanjung Priok line (Kampung Bandan station); "
     "Transjakarta Corridor 12 (Mangga Dua). No code or verified coordinates."),
    ("Stasiun MRT Ancol Marina", None,
     "Phase 2B, underground (planned). id.wikipedia names the northernmost stations 'Ancol Park' and 'Ancol Marina'; "
     "en.wikipedia and the official MRT site use 'Ancol' / 'Ancol Barat'. No code or verified coordinates."),
    ("Stasiun MRT Ancol Barat", None,
     "Phase 2B, surface-level depot and terminus area (planned, 'Ancol Barat'). Naming differs between sources; no code or coordinates."),
]

MRT_EW = [
    ("Balaraja", "EW01", "Phase 3B planned, elevated. Western terminus of the full East-West Line."),
    ("Cibadak", "EW02", "Phase 3B planned, elevated."),
    ("Pasir Gadung", "EW03", "Phase 3B planned, elevated."),
    ("Otonom", "EW04", "Phase 3B planned, elevated."),
    ("Bunder", "EW05", "Phase 3B planned, elevated."),
    ("Kadu", "EW06", "Phase 3B planned, elevated. Interchange: Transjabodetabek T12."),
    ("Bencongan", "EW07", "Phase 3B planned, elevated."),
    ("Danau Ranau", "EW08", "Phase 3B planned, elevated."),
    ("Kelapa Dua", "EW09", "Phase 3B planned, elevated."),
    ("Kebon Nanas", "EW10", "Phase 3B planned, elevated. Interchange: Transjabodetabek T11, S11."),
    ("Panunggangan", "EW11", "Phase 3B planned, elevated. Interchange: Transjabodetabek S61."),
    ("Kunciran", "EW12", "Phase 3B planned, elevated."),
    ("Hasyim Asyari", "EW13", "Phase 3B planned, elevated. Interchange: Trans Tangerang."),
    ("Karang Tengah", "EW14", "Phase 3B planned, elevated."),
    ("Kembangan", "EW15", "Phase 3A Stage 2 planned, elevated."),
    ("Batu Mulia", "EW16", "Phase 3A Stage 2 planned, elevated. Planned interchange with the MRT Outer Ring Line."),
    ("Teknologi", "EW17", "Phase 3A Stage 2 planned, elevated."),
    ("Kebon Jeruk", "EW18", "Phase 3A Stage 2 planned, elevated. Interchange: Transjabodetabek T11, T12, S11, S61."),
    ("Tanjung Duren", "EW19", "Phase 3A Stage 2 planned, elevated."),
    ("Arjuna Selatan", "EW20", "Phase 3A Stage 2 planned, elevated."),
    ("Tomang", "EW21", "Phase 3A Stage 1 planned, underground. Groundbreaking for this stage: 11 September 2024."),
    ("Grogol", "EW22", "Phase 3A Stage 1 planned, underground."),
    ("Roxy", "EW23", "Phase 3A Stage 1 planned, underground."),
    ("Petojo", "EW24", "Phase 3A Stage 1 planned, underground."),
    ("Cideng", "EW25", "Phase 3A Stage 1 planned, underground. Interchange: KRL Commuter Line Cikarang and Rangkasbitung lines (Tanah Abang)."),
    ("Thamrin", "EW26", "Phase 3A Stage 1 planned, underground. Planned interchange with the North-South Line and Transjakarta Corridor 1."),
    ("Kebon Sirih", "EW27", "Phase 3A Stage 1 planned, underground. Interchange: KRL Commuter Line Bogor line (Gondangdia)."),
    ("Kwitang", "EW28", "Phase 3A Stage 1 planned, underground."),
    ("Senen", "EW29", "Phase 3A Stage 1 planned, underground. Interchange: KRL Commuter Line Cikarang line (Pasar Senen), Transjakarta corridors, Senen bus terminal."),
    ("Galur", "EW30", "Phase 3A Stage 1 planned, underground."),
    ("Cempaka Baru", "EW31", "Phase 3A Stage 1 planned, underground."),
    ("Sumur Batu", "EW32", "Phase 3A Stage 1 planned, underground."),
    ("Pakulonan Barat", "EW33", "Phase 3A Stage 1 planned, underground."),
    ("Pakulonan Timur", "EW34", "Phase 3A Stage 1 planned, underground. Planned interchange: LRT Jakarta (Pulomas)."),
    ("Perintis", "EW35", "Phase 3A Stage 1 planned, underground."),
    ("Pulo Gadung", "EW36", "Phase 3A Stage 1 planned, underground."),
    ("Penggilingan", "EW37", "Phase 3A Stage 1 planned, underground."),
    ("Cakung Barat", "EW38", "Phase 3A Stage 1 planned, underground. Planned interchange with the MRT Outer Ring Line."),
    ("Pulo Gebang", "EW39", "Phase 3A Stage 1 planned, underground."),
    ("Ujung Menteng", "EW40", "Phase 3A Stage 1 planned, underground. Rorotan depot access."),
    ("Medan Satria", "EW41", "Phase 3A Stage 1 planned, underground. Eastern terminus of Stage 1."),
    ("Kaliabang", "EW42", "Phase 3B planned (Medan Satria-Cikarang), elevated."),
    ("Harapan Baru", "EW43", "Phase 3B planned, elevated."),
    ("Karang Satria", "EW44", "Phase 3B planned, elevated."),
    ("Sumberjaya", "EW45", "Phase 3B planned, elevated."),
    ("Wanajaya", "EW46", "Phase 3B planned, elevated."),
    ("Cibitung", "EW47", "Phase 3B planned, elevated."),
    ("Cikarang", "EW48", "Phase 3B planned, elevated. Eastern terminus of the full line; interchange with KRL Commuter Line Cikarang."),
]

# --------------------------------------------------------------- LRT Jakarta
LRTJ = [
    ("Stasiun LRT Kelapa Gading", "KPG",
     "Northern terminus; LRT Jakarta depot and head office (Gedung MCC, Jl. Raya Kelapa Nias, Pegangsaan Dua). "
     "Also published as 'Stasiun LRT Pegangsaan Dua (Kelapa Gading)'. id.wikipedia code field 'S-01, KPG'."),
    ("Stasiun LRT Boulevard Utara Summarecon Mall", "BVU",
     "Interchange: Summarecon Mall Kelapa Gading via a 120 m covered connecting bridge opened 24 July 2025. "
     "id.wikipedia code field 'S-02, BVU'."),
    ("Stasiun LRT Boulevard Selatan", "BVS", "id.wikipedia code field 'S-03, BVS'."),
    ("Stasiun LRT Pulomas", "PUM",
     "Interchange: Transjakarta Corridor 2 (Pulomas). id.wikipedia code field 'S-04, PUM'. Coordinates from OpenStreetMap (Nominatim): the id.wikipedia article wrongly duplicates Equestrian's coordinate."),
    ("Stasiun LRT Equestrian", "EQS",
     "Next to the Jakarta International Equestrian Park. id.wikipedia code field 'S-05, EQS' (coordinates from OpenStreetMap/Nominatim; the id.wikipedia article wrongly duplicates Pulomas's coordinate). "
     "(the LRT Jakarta line article uses 'EQT')."),
    ("Stasiun LRT Velodrome", "VEL",
     "Southern terminus of the original 5.8 km / 6-station operation; next to the Jakarta International Velodrome. "
     "Interchange: Transjakarta Corridor 4 (Pemuda Rawamangun). id.wikipedia code field 'S-06, VEL'."),
    ("Stasiun LRT Rawamangun", "RWM",
     "First station of the Phase 1B extension (opened 16 September 2026). "
     "Interchange: Transjakarta Corridor 4 (Kayu Jati); near Universitas Negeri Jakarta. id.wikipedia code field 'S-07, RWM'."),
    ("Stasiun LRT Pramuka", "PKA",
     "Phase 1B extension. id.wikipedia notes trains do not yet call at this station. "
     "Interchange: Transjakarta Corridor 4 (Simpang Pramuka) and Corridor 10 (Pemuda Pramuka). id.wikipedia code field 'S-08, PKA'."),
    ("Stasiun LRT Matraman", "MAT",
     "Phase 1B extension. id.wikipedia notes trains do not yet call at this station. "
     "Interchange: KRL Commuter Line (Kramat station), Transjakarta Corridor 4 and 4D (Pasar Genjing). "
     "id.wikipedia code field 'S-09, MAT'."),
    ("Stasiun LRT Proklamasi", "PKM",
     "Phase 1B extension. id.wikipedia notes trains do not yet call at this station. "
     "id.wikipedia code field 'S-10, PKM'."),
    ("Stasiun Manggarai", "MGI",
     "Southern terminus of the Phase 1B extension, inaugurated by President Prabowo Subianto on 16 September 2026. "
     "Major interchange hub: KRL Commuter Line (Bogor, Cikarang and Rangkasbitung lines), Commuter Line Soekarno-Hatta, "
     "Transjakarta Corridor 4 and 4D (Manggarai), Transjabodetabek B25, Manggarai bus terminal. "
     "id.wikipedia code field 'S-11, MGI'."),
]

# ----------------------------------------------------------- LRT Jabodebek
LRTJ_DUKUH = "Stasiun LRT Dukuh Atas Bankasha Indonesia"


def lrtjb_shared():
    return [
        ("Stasiun LRT Dukuh Atas Bank Syariah Indonesia", "DKA",
         "Official name on the LRT Jabodebek station list is 'Dukuh Atas'; the official fare table calls it 'Dukuh Atas BNI'; "
         "id.wikipedia titles the article 'Stasiun LRT Dukuh Atas Bank Syariah Indonesia'. "
         "Shared terminus of both LRT Jabodebek lines and the northern end of the 18-station Phase 1 network. "
         "Interchange: KRL Commuter Line (Sudirman, BNI City), Commuter Line Soekarno-Hatta, MRT Jakarta North-South Line "
         "(Dukuh Atas BNI), Transjakarta Corridor 1 (Dukuh Atas) and Corridors 4/6 (Galunggung), LRT Jakarta (planned Dukuh Atas stop), "
         "Transjabodetabek B25. Dukuh Atas interchange complex."),
        ("Stasiun LRT Setiabudi", "SET", "Interchange: Transjakarta Corridor 6 (Setiabudi Integritas)."),
        ("Stasiun LRT Rasuna Said", "RAS", "Interchange: Transjakarta Corridor 6 (Rasuna Said)."),
        ("Stasiun LRT Kuningan", "KUA", "Interchange: Transjakarta Corridor 6 (Kuningan)."),
        ("Stasiun LRT Pancoran", None,
         "Official fare table and station list on lrtjabodebek.kai.id name it 'Pancoran bank bjb'. "
         "Interchange: Transjakarta Corridor 9 (Pancoran); Transjabodetabek P11. No 3-letter code published."),
        ("Stasiun LRT Cikoko", "CKK",
         "Interchange: KRL Commuter Line Bogor line (Cawang station); Transjakarta Corridor 9 (Cikoko)."),
        ("Stasiun LRT Ciliwung", "CIL", "Interchange: Transjakarta Corridor 9 (Ciliwung)."),
        ("Stasiun LRT Cawang", "CWG",
         "Branch point of the two LRT Jabodebek lines. Interchange: KRL Commuter Line Bogor line (Cawang station); "
         "Transjakarta Corridors 7 and 9 (Cawang); Transjabodetabek B11, B21."),
    ]


LRTJB_CIBUBUR_EXTRA = [
    ("Stasiun LRT Taman Mini", "TMI",
     "On the Cibubur line only, near Taman Mini Indonesia Indah. Official station list names it 'Taman Mini'; "
     "id.wikipedia article title is 'Stasiun LRT TMII'. Interchange: Transjakarta Corridor 9 (Makasar)."),
    ("Stasiun LRT Kampung Rambutan", "KAM",
     "Interchange: Transjakarta Corridor 7 (Kampung Rambutan), Kampung Rambutan bus terminal, Transjabodetabek S22."),
    ("Stasiun LRT Ciracas", "CRC", "Cibubur line only."),
    ("Stasiun LRT Harjamukti", "HAR",
     "Southern terminus of the Cibubur line. Interchange: Transjakarta D11 (Stasiun LRT Harjamukti); "
     "Transjabodetabek D11, P11 at Cibubur Junction / buperta Cibubur."),
]

LRTJB_BEKASI_EXTRA = [
    ("Stasiun Halim", "HAL",
     "On the Bekasi line only. Interchange: Whoosh high-speed rail (Halim station); KAI Commuter Line Cikarang line "
     "(Cawang is the nearest KRL interchange). id.wikipedia code field 'HLM (kereta cepat) / HAL (LRT)'."),
    ("Stasiun LRT Jati Bening Baru", "JBU", "Bekasi line only."),
    ("Stasiun LRT Cikunir 1", "CK1", "Bekasi line only."),
    ("Stasiun LRT Cikunir 2", "CK2", "Bekasi line only."),
    ("Stasiun LRT Bekasi Barat", "BEK",
     "Bekasi line only. Interchange: Transjakarta B1/B3 (Revo Town); Transjabodetabek B11, B25. "
     "Connected to Revo Town and Pakuwon Mall Bekasi."),
    ("Stasiun LRT Jati Mulya", "JTM",
     "Eastern terminus of the Bekasi line and the LRT Jabodebek depot. "
     "Interchange: Transjakarta TWM1, B1; Transjabodetabek B21."),
]

# ------------------------------------------------------------------- KRL
KRL_BOGOR = [
    ("Stasiun Jakarta Kota", "Jakarta Kota", "B01/TP01",
     "Western terminus of the Bogor line and of the Tanjung Priok line. Interchange: Transjakarta Corridors 1 and 12, "
     "Transjabodetabek routes 1A and 12B."),
    ("Stasiun Jayakarta", "Jayakarta", "B02", "Interchange: Transjakarta microtrans (mikrotrans)."),
    ("Stasiun Mangga Besar", "Mangga Besar", "B03", ""),
    ("Stasiun Sawah Besar", "Sawah Besar", "B04", ""),
    ("Stasiun Juanda", "Juanda", "B05",
     "Interchange: Transjakarta Corridors 2, 5C, 7F and 8; Transjabodetabek T12; 51ST."),
    ("Stasiun Gambir", "Gambir", "B06",
     "KRL trains do not stop here (passes through only). Interchange: all intercity trains, Transjakarta Corridors 2 and 2A, "
     "Transjabodetabek 1P, 2P, 6H."),
    ("Stasiun Gondangdia", "Gondangdia", "B07", "Interchange: Transjakarta Corridor 1."),
    ("Stasiun Cikini", "Cikini", "B08", "Interchange: Transjakarta Corridor 1."),
    ("Stasiun Manggarai", "Manggarai", "B09/C13/A01",
     "Major interchange hub: Commuter Line Cikarang, Commuter Line Soekarno-Hatta, LRT Jakarta (Manggarai LRT station), "
     "Transjakarta Corridors 4 and 4D; Manggarai bus terminal."),
    ("Stasiun Tebet", "Tebet", "B10", ""),
    ("Stasiun Cawang", "Cawang", "B11",
     "Interchange: LRT Jabodebek (both lines), Transjakarta Corridors 7 and 9, Transjabodetabek B11, B21."),
    ("Stasiun Duren Kalibata", "Duren Kalibata", "B12", ""),
    ("Stasiun Pasar Minggu Baru", "Pasar Minggu Baru", "B13", ""),
    ("Stasiun Pasar Minggu", "Pasar Minggu", "B14", "Interchange: Transjakarta Corridor 9."),
    ("Stasiun Tanjung Barat", "Tanjung Barat", "B15", "Interchange: Transjakarta Corridor 1; MRT Jakarta Phase 4 (planned)."),
    ("Stasiun Lenteng Agung", "Lenteng Agung", "B16", ""),
    ("Stasiun Universitas Pancasila", "Universitas Pancasila", "B17", ""),
    ("Stasiun Universitas Indonesia", "Universitas Indonesia", "B18", ""),
    ("Stasiun Pondok Cina", "Pondok Cina", "B19", ""),
    ("Stasiun Depok Baru", "Depok Baru", "B20", ""),
    ("Stasiun Depok", "Depok", "B21", "Interchange: Transjakarta Corridor 1; MRT Jakarta Outer Ring Line (planned)."),
    ("Stasiun Citayam", "Citayam", "B22/Bb22", "Branch point for the Nambo shuttle."),
    ("Stasiun Bojonggede", "Bojonggede", "B23", ""),
    ("Stasiun Cilebut", "Cilebut", "B24", ""),
    ("Stasiun Sukaresmi", "Sukaresmi", "B25",
     "No id.wikipedia station article exists (article title missing), so no 3-letter code could be verified."),
    ("Stasiun Bogor", "Bogor", "B26", "Eastern terminus of the Bogor line. Interchange: Transjakarta Corridor 1."),
]

KRL_NAMBO = [
    ("Stasiun Citayam", "Citayam", "Bb22", "Branch point for the Nambo shuttle (permitted shuttle only)."),
    ("Stasiun Pondok Rajeg", "Pondok Rajeg", "Bb23", "Nambo shuttle."),
    ("Stasiun Cibinong", "Cibinong", "Bb24", "Nambo shuttle."),
    ("Stasiun Gunung Putri", "Gunung Putri", "Bb25", "Nambo shuttle."),
    ("Stasiun Nambo", "Nambo", "Bb26", "Eastern terminus of the Nambo shuttle."),
]

KRL_CIKARANG = [
    ("Stasiun Pondok Jati", "Pondok Jati", "C01",
     "First station of the Loop (Lingkar) numbering. The C01-C14 chain is served as a one-way loop that closes through Cawang."),
    ("Stasiun Kramat", "Kramat", "C02", "Interchange: LRT Jakarta (Matraman station, nearby)."),
    ("Stasiun Gang Sentiong", "Gang Sentiong", "C03", ""),
    ("Stasiun Pasar Senen", "Pasar Senen", "C04",
     "Interchange: Transjakarta Corridors 2 and 14, Senen bus terminal. Only northbound (Kampung Bandan) trains stop here."),
    ("Stasiun Kemayoran", "Kemayoran", "C05", ""),
    ("Stasiun Rajawali", "Rajawali", "C06", ""),
    ("Stasiun Kampung Bandan", "Kampung Bandan", "C07/TP02",
     "Interchange: Tanjung Priok line. Transjakarta Corridors 5 and 10H."),
    ("Stasiun Angke", "Angke", "C08", "Only some half-racket journeys stop here."),
    ("Stasiun Duri", "Duri", "C09/T01/A03",
     "Interchange: Commuter Line Tangerang and Commuter Line Soekarno-Hatta."),
    ("Stasiun Tanah Abang", "Tanah Abang", "C10/R01",
     "Interchange: Commuter Line Rangkasbitung; Transjakarta Corridors 1 and 3; Tanah Abang bus terminal."),
    ("Stasiun BNI City", "BNI City", "C11/A02",
     "Interchange: Commuter Line Soekarno-Hatta, MRT Jakarta (Dukuh Atas BNI), LRT Jabodebek (Dukuh Atas), Transjakarta."),
    ("Stasiun Sudirman", "Sudirman", "C12",
     "Interchange: Commuter Line Soekarno-Hatta, MRT Jakarta (Dukuh Atas BNI), LRT Jabodebek (Dukuh Atas), Transjakarta."),
    ("Stasiun Manggarai", "Manggarai", "C13/B09/A01",
     "Interchange: Commuter Line Bogor, Commuter Line Soekarno-Hatta, LRT Jakarta, Transjakarta."),
    ("Stasiun Matraman", "Matraman", "C14", "Interchange: LRT Jakarta (Matraman station)."),
    ("Stasiun Jatinegara", "Jatinegara", "C15",
     "Interchange: Transjakarta Corridors 1, 3, 5, 6 and 9; Jatinegara bus terminal; most long-distance trains."),
    ("Stasiun Klender", "Klender", "C16", "Interchange: Transjakarta Corridor 11 (Flyover Klender)."),
    ("Stasiun Buaran", "Buaran", "C17", ""),
    ("Stasiun Klender Baru", "Klender Baru", "C18", ""),
    ("Stasiun Cakung", "Cakung", "C19", "Interchange: MRT Jakarta Outer Ring Line (planned)."),
    ("Stasiun Kranji", "Kranji", "C20", ""),
    ("Stasiun Bekasi", "Bekasi", "C21", "Interchange: Transjakarta Corridor 1 and Transjabodetabek."),
    ("Stasiun Bekasi Timur", "Bekasi Timur", "C22", ""),
    ("Stasiun Tambun", "Tambun", "C23", ""),
    ("Stasiun Cibitung", "Cibitung", "C24", ""),
    ("Stasiun Metland Telagamurni", "Metland Telagamurni", "C25", ""),
    ("Stasiun Cikarang", "Cikarang", "C26", "Eastern terminus of the Cikarang line. Interchange: Transjakarta W1; MRT East-West Line (planned)."),
]

KRL_RANGKASBITUNG = [
    ("Stasiun Tanah Abang", "Tanah Abang", "R01/C10", "Interchange: Commuter Line Cikarang; Transjakarta."),
    ("Stasiun Palmerah", "Palmerah", "R02", ""),
    ("Stasiun Kebayoran", "Kebayoran", "R03", ""),
    ("Stasiun Pondok Ranji", "Pondok Ranji", "R04", ""),
    ("Stasiun Jurangmangu", "Jurangmangu", "R05", ""),
    ("Stasiun Sudimara", "Sudimara", "R06", ""),
    ("Stasiun Rawa Buntu", "Rawa Buntu", "R07", "id.wikipedia article title is 'Stasiun Rawa Buntu'; code field 'RU'."),
    ("Stasiun Serpong", "Serpong", "R08", ""),
    ("Stasiun Cisauk", "Cisauk", "R09", ""),
    ("Stasiun Cicayur", "Cicayur", "R10", ""),
    ("Stasiun Jatake", "Jatake", "R11", ""),
    ("Stasiun Parung Panjang", "Parung Panjang", "R12", ""),
    ("Stasiun Lumpang Parayasa", "Lumpang Parayasa", "R13", "No 3-letter code published."),
    ("Stasiun Cilejit", "Cilejit", "R14", ""),
    ("Stasiun Daru", "Daru", "R15", ""),
    ("Stasiun Tenjo", "Tenjo", "R16", ""),
    ("Stasiun Tigaraksa Podomoro", "Tigaraksa Podomoro", "R17",
     "id.wikipedia article exists but has no 3-letter code and no coordinate."),
    ("Stasiun Tigaraksa", "Tigaraksa", "R18", ""),
    ("Stasiun Cikoya", "Cikoya", "R19", ""),
    ("Stasiun Maja", "Maja", "R20", ""),
    ("Stasiun Citeras", "Citeras", "R21", ""),
    ("Stasiun Rangkasbitung", "Rangkasbitung", "R22", "Eastern terminus of the Rangkasbitung line."),
]

KRL_TANGERANG = [
    ("Stasiun Duri", "Duri", "T01/C09/A03", "Interchange: Commuter Line Cikarang and Commuter Line Soekarno-Hatta."),
    ("Stasiun Grogol", "Grogol", "T02", ""),
    ("Stasiun Pesing", "Pesing", "T03", ""),
    ("Stasiun Taman Kota", "Taman Kota", "T04", ""),
    ("Stasiun Bojong Indah", "Bojong Indah", "T05", ""),
    ("Stasiun Rawa Buaya", "Rawa Buaya", "T06/A03a", ""),
    ("Stasiun Kalideres", "Kalideres", "T07", ""),
    ("Stasiun Poris", "Poris", "T08", ""),
    ("Stasiun Tanah Tinggi", "Tanah Tinggi", "T09", ""),
    ("Stasiun Tangerang", "Tangerang", "T10/T11",
     "Eastern terminus of the Tangerang line. id.wikipedia table gives the code as T11; the KAI code field is not published on a "
     "station article. Interchange: Transjakarta / Trans Tangerang."),
]

KRL_TANJUNGPRIOK = [
    ("Stasiun Jakarta Kota", "Jakarta Kota", "TP01/B01", "Interchange: Commuter Line Bogor; Transjakarta."),
    ("Stasiun Kampung Bandan", "Kampung Bandan", "TP02/C07", "Interchange: Commuter Line Cikarang; Transjakarta."),
    ("Stasiun Ancol", "Ancol", "TP03", "Interchange: Transjakarta Corridor 5, 12; MRT Jakarta Phase 2B (planned)."),
    ("Stasiun Jakarta International Stadium", "Jakarta International Stadium", "TP04",
     "Interchange: Transjakarta Corridor 14; Jakarta International Stadium (JIEP)."),
    ("Stasiun Tanjung Priok", "Tanjung Priok", "TP05", "Eastern terminus of the Tanjung Priok line; port area."),
]


def build_krl(pool, rows):
    out = []
    for title, name, jakrsn, note in rows:
        st = pick(pool, title, note=note)
        st["name"] = name
        out.append(st)
    return out


def build_mrt(pool, rows):
    out = []
    for title, code, note in rows:
        st = pick(pool, title, code=code, note=note)
        out.append(st)
    return out


def build_lrt(pool, rows):
    """LRT pool, falling back to the KRL articles for shared stations (Manggarai)."""
    merged = dict(krl)
    merged.update(pool)
    out = []
    for title, code, note in rows:
        st = pick(merged, title, code=code, note=note)
        out.append(st)
    return out


MRT_SRC = [
    "https://www.jakartamrt.co.id/",
    "https://beweb-dev.jakartamrt.co.id/middleware/api/datum",
    "https://en.wikipedia.org/wiki/North%E2%80%93South_Line_(Jakarta_MRT)",
    "https://id.wikipedia.org/wiki/Jalur_Utara%E2%80%93Selatan_(MRT_Jakarta)",
    "https://id.wikipedia.org/wiki/MRT_Jakarta",
    "https://id.wikipedia.org/wiki/Jalur_Timur%E2%80%93Barat_(MRT_Jakarta)",
    "https://jakartamrt.co.id/id/proyek/fase-2",
]
LRTJ_SRC = [
    "https://lrtjakarta.co.id/",
    "https://lrtjakarta.co.id/schedule",
    "https://lrtjakarta.co.id/api/schedule/live",
    "https://lrtjakarta.co.id/press_conference/yAQ95X1p0X",
    "https://lrtjakarta.co.id/press_conference/lgN9gjdpYR",
    "https://id.wikipedia.org/wiki/LRT_Jakarta",
    "https://id.wikipedia.org/wiki/Stasiun_LRT_Velodrome",
]
LRTJB_SRC = [
    "https://lrtjabodebek.kai.id/stations",
    "https://lrtjabodebek.kai.id/informasi-tarif",
    "https://lrtjabodebek.kai.id/lrt-guides",
    "https://lrtjabodebek.kai.id/jadwal-keberangkatan",
    "https://id.wikipedia.org/wiki/LRT_Jabodebek",
    "https://id.wikipedia.org/wiki/Lin_Cibubur",
    "https://id.wikipedia.org/wiki/Lin_Bekasi",
]
KRL_SRC = [
    "https://id.wikipedia.org/wiki/KRL_Commuter_Line",
    "https://id.wikipedia.org/wiki/KAI_Commuter",
    "https://id.wikipedia.org/wiki/Commuter_Line_Bogor",
    "https://id.wikipedia.org/wiki/Commuter_Line_Cikarang",
    "https://id.wikipedia.org/wiki/Commuter_Line_Rangkasbitung",
    "https://id.wikipedia.org/wiki/Commuter_Line_Tangerang",
    "https://id.wikipedia.org/wiki/Commuter_Line_Tanjung_Priok",
    "https://www.kai.id/",
    "https://commuterline.id/",
]

doc = {
    "systems": [
        {
            "systemId": "mrt-jakarta",
            "name": "MRT Jakarta",
            "mode": "metro",
            "operator": "PT MRT Jakarta Perseroda",
            "serviceClass": "rapid-transit",
            "lines": [
                {
                    "code": "NS",
                    "name": "North-South Line (Lin Utara-Selatan)",
                    "operator": "PT MRT Jakarta Perseroda",
                    "lengthKm": 15.7,
                    "status": "operating (Phase 1: Lebak Bulus-Bundaran HI); Phase 2A under construction; Phase 2B planned",
                    "corridorType": "metro",
                    "stations": build_mrt(mrt, MRT_NS),
                    "sources": MRT_SRC,
                },
                {
                    "code": "EW",
                    "name": "East-West Line (Lin Timur-Barat)",
                    "operator": "PT MRT Jakarta Perseroda",
                    "lengthKm": 87.0,
                    "status": "under construction (Phase 1 Stage 1: Tomang-Medan Satria, 24.5 km); Stage 2 and Phase 2 planned",
                    "corridorType": "metro",
                    "stations": [
                        {
                            "name": n, "code": c, "latitude": None, "longitude": None, "note": note,
                        } for n, c, note in MRT_EW
                    ],
                    "sources": MRT_SRC,
                },
            ],
        },
        {
            "systemId": "lrt-jakarta",
            "name": "LRT Jakarta",
            "mode": "light-rail",
            "operator": "PT LRT Jakarta",
            "serviceClass": "light-rail",
            "lines": [
                {
                    "code": "S",
                    "name": "South Line (Lin Selatan) - Kelapa Gading to Manggarai",
                    "operator": "PT LRT Jakarta",
                    "lengthKm": 12.2,
                    "status": "operating (Phase 1A Velodrome-Kelapa Gading since 2019; Phase 1B Velodrome-Manggarai since 16 September 2026)",
                    "corridorType": "light-rail",
                    "stations": build_lrt(lrt, LRTJ),
                    "sources": LRTJ_SRC,
                }
            ],
        },
        {
            "systemId": "lrt-jabodebek",
            "name": "LRT Jabodebek",
            "mode": "light-rail",
            "operator": "PT Kereta Api Indonesia (Persero), Divisi LRT Jabodebek",
            "serviceClass": "light-rail",
            "lines": [
                {
                    "code": "CB",
                    "name": "Cibubur Line (Lin Cibubur) - Dukuh Atas to Harjamukti",
                    "operator": "PT Kereta Api Indonesia (Persero), Divisi LRT Jabodebek",
                    "lengthKm": 25.94,
                    "status": "operating (opened 28 August 2023); Cibubur-Bogor extension in feasibility study",
                    "corridorType": "light-rail",
                    "stations": build_lrt(lrt, lrtjb_shared() + LRTJB_CIBUBUR_EXTRA),
                    "sources": LRTJB_SRC,
                },
                {
                    "code": "BK",
                    "name": "Bekasi Line (Lin Bekasi) - Dukuh Atas to Jati Mulya",
                    "operator": "PT Kereta Api Indonesia (Persero), Divisi LRT Jabodebek",
                    "lengthKm": 29.54,
                    "status": "operating (opened 28 August 2023)",
                    "corridorType": "light-rail",
                    "stations": build_lrt(lrt, lrtjb_shared() + LRTJB_BEKASI_EXTRA),
                    "sources": LRTJB_SRC,
                },
            ],
        },
        {
            "systemId": "krl-jabodetabek",
            "name": "KRL Commuter Line Jabodetabek",
            "mode": "commuter-rail",
            "operator": "PT Kereta Api Indonesia (Persero) / KAI Commuter",
            "serviceClass": "commuter-rail",
            "lines": [
                {
                    "code": "B",
                    "name": "Commuter Line Bogor",
                    "operator": "PT Kereta Api Indonesia (Persero) / KAI Commuter",
                    "lengthKm": 54.8,
                    "status": "operating (Jakarta Kota-Bogor); Nambo shuttle service since 28 May 2022",
                    "corridorType": "commuter-rail",
                    "stations": build_krl(krl, KRL_BOGOR),
                    "sources": KRL_SRC,
                },
                {
                    "code": "Bb",
                    "name": "Commuter Line Bogor - Nambo shuttle",
                    "operator": "PT Kereta Api Indonesia (Persero) / KAI Commuter",
                    "lengthKm": 51.0,
                    "status": "operating (shuttle to Nambo since 28 May 2022)",
                    "corridorType": "commuter-rail",
                    "stations": build_krl(krl, KRL_NAMBO),
                    "sources": KRL_SRC,
                },
                {
                    "code": "C",
                    "name": "Commuter Line Cikarang (Loop Line)",
                    "operator": "PT Kereta Api Indonesia (Persero) / KAI Commuter",
                    "lengthKm": 87.4,
                    "status": "operating (Kampung Bandan-Cikarang, and Angke-Cikarang since 28 May 2022)",
                    "corridorType": "commuter-rail",
                    "stations": build_krl(krl, KRL_CIKARANG),
                    "sources": KRL_SRC,
                },
                {
                    "code": "R",
                    "name": "Commuter Line Rangkasbitung",
                    "operator": "PT Kereta Api Indonesia (Occurs) / KAI Commuter",
                    "lengthKm": 72.8,
                    "status": "operating (Tanah Abang-Rangkasbitung)",
                    "corridorType": "commuter-rail",
                    "stations": build_krl(krl, KRL_RANGKASBITUNG),
                    "sources": KRL_SRC,
                },
                {
                    "code": "T",
                    "name": "Commuter Line Tangerang",
                    "operator": "PT Kereta Api Indonesia (Persero) / KAI Commuter",
                    "lengthKm": 19.3,
                    "status": "operating (Duri-Tangerang)",
                    "corridorType": "commuter-rail",
                    "stations": build_krl(krl, KRL_TANGERANG),
                    "sources": KRL_SRC,
                },
                {
                    "code": "TP",
                    "name": "Commuter Line Tanjung Priok",
                    "operator": "PT Kereta Api Indonesia (Persero) / KAI Commuter",
                    "lengthKm": 8.1,
                    "status": "operating (Jakarta Kota-Tanjung Priok; full service since 22 December 2015)",
                    "corridorType": "commuter-rail",
                    "stations": build_krl(krl, KRL_TANJUNGPRIOK),
                    "sources": KRL_SRC,
                },
            ],
        },
    ],
    "notes": [
        "Research snapshot date: 2026-10-20 (Asia/Jakarta). All statuses and opening dates reflect sources published up to that date.",
        "IMPORTANT CORRECTION to the brief: the MRT Jakarta East-West Line is NOT in passenger service. As of 2026-10-20 the only "
        "operating MRT line is the North-South Line Phase 1 (13 stations, 15.7 km). The official MRT Jakarta project page "
        "describes the East-West Line as 'Fase 1 Tahap 1' (Phase 1 Stage 1) = Tomang-Medan Satria, 24.5 km, with groundbreaking "
        "on 11 September 2024. 'Jakarta International Stadium' and 'Kota Intan' in the brief are LRT Jakarta / planned-LRT names, "
        "not MRT Jakarta East-West Line stations.",
        "IMPORTANT CORRECTION to the brief: there is no MRT Jakarta 'Phase 1.5 (Bundaran HI - Ancol)'. The extension north of "
        "Bundaran HI is Phase 2A (7 underground stations: Thamrin, Monas, Harmoni, Sawah Besar, Mangga Besar, Glodok, Kota; "
        "segment 1 target 2027, segment 2 target 2029) followed by Phase 2B (Kota-Ancol Barat).",
        "IMPORTANT CORRECTION to the brief: LRT Jakarta is a single elevated line with 11 stations over 12.2 km "
        "(Kelapa Gading - Manggarai), not 13 stations over 5.1 km. The original 5.8 km / 6-station operation (Pegangsaan Dua/"
        "Kelapa Gading - Velodrome) has been in commercial service since 1 December 2019; the Phase 1B extension to Manggarai "
        "was inaugurated by President Prabowo Subianto on 16 September 2026.",
        "IMPORTANT CORRECTION to the brief: LRT Jabodebek has 18 stations in Phase 1 (not 31), on two lines that share a common "
        "Dukuh Atas-Cawang trunk: Cibubur Line (Dukuh Atas-Harjamukti, 25.94 km) and Bekasi Line (Dukuh Atas-Jati Mulya, 29.54 km). "
        "Both opened on 28 August 2023. There is no 'Cawang-Depok Baru' or 'Cawang-Cibubur' branch pair.",
        "IMPORTANT CORRECTION to the brief: the KRL 'Cibubur Line' is the former name of the Commuter Line Bogor. The "
        "KRL Lingkar (loop) route was reduced to five Jabodetabek lines after the 28 May 2022 restructuring. The "
        "Tanjung Priok Line runs Jakarta Kota - Kampung Bandan - Ancol - Jakarta International Stadium - Tanjung Priok.",
        "Station codes: MRT Jakarta uses 3-letter codes (LBB, FTM, CPR, HJN, BLA, BLM, SSM, SNY, IST, BNH, STB, DKA, BHI). "
        "LRT Jakarta uses S-01..S-11 with 3-letter abbreviations. LRT Jabodebek uses 3-letter codes (DKA, SET, RAS, KUA, CKK, "
        "CIL, CWG, TMI, KAM, CRC, HAR, HAL, JBU, CK1, CK2, BEK, JTM). KAI uses 3-letter codes (JAKK, MGI, TPK, CW, ...). "
        "Indonesian Wikipedia additionally carries an 'NSnn' sequence for the MRT North-South Line and JakRSN badges "
        "(B/C/R/T/TP/A prefixes for KRL lines, M for MRT, S for LRT Jakarta, CB/BK for LRT Jabodebek, EW for the MRT "
        "East-West Line). Both are recorded in the note fields.",
        "Coordinates are WGS84 decimal degrees taken from the Wikipedia infobox {{coord}} template where available, otherwise "
        "from the Wikidata P625 claim. Coordinates are null where no verifiable value could be found; no coordinate is estimated. "
        "Planned / not-yet-built stations (MRT Phase 2A/2B, MRT East-West Line) therefore have null coordinates.",
        "No official GTFS feed was found for any of the four operators. See the report for every API endpoint that was tested.",
        "The LRT Jakarta live-schedule API (https://lrtjakarta.co.id/api/schedule/live) and the LRT Jakarta /schedule page are "
        "the only machine-readable real-time endpoints found. They require no authentication.",
    ],
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
print("wrote", OUT)
for s in doc["systems"]:
    for l in s["lines"]:
        n = len(l["stations"])
        withc = sum(1 for st in l["stations"] if st["latitude"] is not None)
        print(f"  {s['systemId']:16} {l['code']:3} {l['name'][:46]:48} stations={n:3} withCoords={withc}")
