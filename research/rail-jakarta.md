# Jakarta-area rail & metro systems — research report

**Snapshot date:** 2026-10-20 (Asia/Jakarta)
**Scope:** MRT Jakarta, LRT Jakarta, LRT Jabodebek, KRL Commuter Line (Jabodetabek)
**Companion data file:** [`data/rail-jakarta.json`](data/rail-jakarta.json)

---

## 0. Executive summary — and four corrections to the brief

Research against official operator sites, operator backend APIs, Indonesian and English
Wikipedia (raw wikitext + Wikidata), and OpenStreetMap/Nominatim produced **202 documented
station entries, 147 of them with verifiable WGS84 coordinates**. Four premises in the
brief turned out to be wrong and are corrected below; everything else is sourced.

| # | Brief said | Verified reality | Primary source |
|---|---|---|---|
| 1 | MRT East–West Line Phase 1 runs "Jakarta International Stadium – Kota Intan" | **The MRT East–West Line is not in passenger service at all.** Only the NS Line Phase 1 (13 stations, 15.7 km) operates. The EW Line's first construction stage is "Tomang – Medan Satria", 24.5 km, groundbreaking 11 Sep 2024. "Jakarta International Stadium" is an **LRT Jakarta / KRL Tanjung Priok** station name; "Kota Intan" could not be found in any official or reference source. | [MRT Jakarta API – "Fase 1 Tahap 1 Lin Timur Barat"](https://beweb-dev.jakartamrt.co.id/middleware/api/datum), [id.wikipedia MRT Jakarta](https://id.wikipedia.org/wiki/MRT_Jakarta) |
| 2 | MRT has a "Phase 1.5 (Bundaran HI – Ancol, 4 stations)" | No Phase 1.5 exists. The northward extension is **Phase 2A** (7 underground stations: Thamrin, Monas, Harmoni, Sawah Besar, Mangga Besar, Glodok, Kota; segment 1 target 2027, segment 2 target 2029) then **Phase 2B** (Kota → Ancol Barat). | [MRT Jakarta API – "Fase 2A Lin Utara Selatan"](https://beweb-dev.jakartamrt.co.id/middleware/api/datum) |
| 3 | LRT Jakarta: Kelapa Gading ↔ JIS, ~5.1 km, **13 stations** | **11 stations, 12.2 km**, Kelapa Gading → Manggarai. The original 5.8 km / 6-station operation (Pegangsaan Dua–Kelapa Gading ↔ Velodrome) has run since 1 Dec 2019; the Phase 1B extension to Manggarai was inaugurated by President Prabowo Subianto on **16 Sep 2026**. | [LRT Jakarta press release 16 Sep 2026](https://lrtjakarta.co.id/press_conference/yAQ95X1p0X) |
| 4 | LRT Jabodebek: ~31 stations, branches "Cawang–Depok Baru" and "Cawang–Cibubur" | **18 stations, 2 lines** that share a Dukuh Atas–Cawang trunk: **Cibubur Line** (Dukuh Atas → Harjamukti, 25.94 km) and **Bekasi Line** (Dukuh Atas → Jati Mulya, 29.54 km). Both opened 28 Aug 2023. | [lrtjabodebek.kai.id/stations](https://lrtjabodebek.kai.id/stations) |

Two further brief statements need qualification:

* **KRL "Cibubur Line"** is the *former name* of the Commuter Line Bogor. After the
  28 May 2022 restructuring there are **five** Jabodetabek KRL lines (Bogor, Cikarang,
  Rangkasbitung, Tangerang, Tanjung Priok); the old "Lingkar" route was folded into Bogor
  and Lingkar Cikarang.
  Source: [id.wikipedia – KRL Commuter Line](https://id.wikipedia.org/wiki/KRL_Commuter_Line).
* **KRL Tanjung Priok Line** runs *Jakarta Kota – Kampung Bandan – Ancol – Jakarta
  International Stadium – Tanjung Priok* (4 stations per the route table, 5 counting
  both termini), not "Tanjung Priok – Manggarai – Cikini – …".
  Source: [id.wikipedia – Commuter Line Tanjung Priok](https://id.wikipedia.org/wiki/Commuter_Line_Tanjung_Priok).

---

## 1. Method and verification rules

* The built-in `web_search` tool was non-functional in this session (HTTP 401 from the
  search backend). A fallback helper (`research/tools/search.py`, Bing HTML scrape) and
  direct `curl`/`web_fetch` were used instead.
* **Official operator sources first.** Where an operator publishes its own backend API,
  that API was queried directly and its data used verbatim.
* **Station names** come from operator websites/fare tables first, then
  Indonesian Wikipedia (`id.wikipedia.org`) raw wikitext, then English Wikipedia.
* **Station codes** come from the `kode` / `code` infobox fields and from the
  `{{JakRSN|…}}` route badges used on Indonesian Wikipedia, which implement the
  Indonesian rail standardised numbering scheme.
* **Coordinates** are WGS84 decimal degrees. Priority order:
  1. the article's own `{{coord}}` template,
  2. the linked Wikidata item's `P625` coordinate-location claim,
  3. OpenStreetMap via the Nominatim geocoder.
  **No coordinate is estimated or interpolated.** Where none of those yielded a value the
  field is `null` and the reason is stated in the note.
* Every URL listed under "Sources" in this report was actually fetched during the
  research; failed endpoints are listed explicitly in §8.

---

## 2. MRT Jakarta

**Operator:** PT MRT Jakarta Perseroda (owned by the DKI Jakarta provincial government,
through Perumda Pasar Jaya). Official site: <https://www.jakartamrt.co.id/>.
**Vehicle name:** *Ratangga* (MRTJ 1000 series, 16 six-car sets, 1,067 mm gauge,
1,500 V DC overhead, 80 km/h elevated / 100 km/h underground, CBTC GoA2 for Phase 2).
Source: [id.wikipedia – Lin Utara–Selatan](https://id.wikipedia.org/wiki/Jalur_Utara%E2%80%93Selatan_(MRT_Jakarta)).

### 2.1 Line status

| Line | Code | Alignment | Length | Status |
|---|---|---|---|---|
| North–South | `NS` | Lebak Bulus ↔ Bundaran HI Bank Jakarta | **15.7 km** (≈10 km elevated + ≈6 km underground), 13 stations | **Operating** since 24 Mar 2019 |
| North–South Phase 2A | `NS` | Bundaran HI → Kota | ≈5.8 km, 7 underground stations | Under construction — segment 1 (Bundaran HI→Harmoni) target 2027, segment 2 (Harmoni→Kota) target 2029 |
| North–South Phase 2B | `NS` | Kota → Ancol Barat | ≈5.2 km, 3 stations | Planned / feasibility stage |
| East–West Phase 1 Stage 1 | `EW` | Tomang (West Jakarta) ↔ Medan Satria (Bekasi) | 24.5 km (+ 5.9 km Rorotan depot spur) | Under construction — groundbreaking 11 Sep 2024 |
| East–West Phase 1 Stage 2 | `EW` | Tomang → Kembangan | ≈9.2 km | Planned |
| East–West Phase 2 | `EW` | Kembangan→Balaraja (≈29.9 km) and Medan Satria→Cikarang (≈20 km) | ≈87–90 km total, 48 stations planned | Planned |

All phase/alignment/length figures above are taken verbatim from the operator's own
content API (`/middleware/api/datum`, records "Fase 1 Lin Utara Selatan",
"Fase 2A Lin Utara Selatan", "Fase 1 Tahap 1 Lin Timur Barat"; updated 2026-04-08 and
2026-09-29) and cross-checked against
[id.wikipedia – MRT Jakarta](https://id.wikipedia.org/wiki/MRT_Jakarta) and
[id.wikipedia – Jalur Utara–Selatan](https://id.wikipedia.org/wiki/Jalur_Utara%E2%80%93Selatan_(MRT_Jakarta)).

> **Note on the "Sawah Besar / JIExpo / Karawang" grouping in the brief:** *Sawah Besar* is
> a real MRT **North–South** station (Phase 2A), not an EW station. *Jakarta International
> Expo* is the Transjakarta Corridor 14 terminus and the KRL Tanjung Priok Line's
> "Jakarta International Stadium" station. *Karawang* is a city on the future EW alignment
> (the pre-2024 plan ran to Karawang); the current plan reaches Cikarang.

### 2.2 North–South Line — operating stations (in order)

Official names as published by the operator's API record names; codes from the
`kode`/`code` infobox fields. `id.wikipedia` also carries an `NSnn` sequence in the same
field (recorded in the JSON note field).

| # | Station | Code | Coordinates (WGS84) | Structure / platforms | Interchanges |
|---|---|---|---|---|---|
| 1 | Lebak Bulus Bank Syariah Indonesia | `LBB` (NS21) | -6.28930, 106.77460 | Elevated, 2 side platforms | Transjakarta Corridor 8; Transjabodetabek S21/S22/D21/D41; Lebak Bulus bus terminal. **MRT depot + operations office** |
| 2 | Fatmawati Indomaret | `FTM` (NS20) | -6.29230, 106.79230 | Elevated, 2 side platforms | Planned MRT Outer Ring Line; Transjabodetabek D21/D41 |
| 3 | Cipete Raya Tuku | `CPR` (NS19) | -6.27740, 106.79750 | Elevated, 2 side platforms | — |
| 4 | Haji Nawi | `HJN` (NS18) | -6.26680, 106.79732 | Elevated, 2 side platforms | — |
| 5 | Blok A Visa | `BLA` (NS17) | -6.25558, 106.79713 | Elevated, 2 side platforms | TOD integrated with Pasar Blok A |
| 6 | Blok M BCA | `BLM` (NS16) | -6.24453, 106.79821 | Elevated, **2 island platforms, 3 tracks** (the only 3-track MRT station) | Transjakarta Corridor 1; Transjabodetabek P11/S21/S61/SH2/T31; Blok M bus terminal |
| 7 | ASEAN Headquarters | `SSM` (NS15) | -6.23909, 106.79860 | Elevated, 2 side platforms | Originally "Sisingamangaraja". Transjakarta Corridor 1 (ASEAN/Kejaksaan Agung); CSW transport hub; Transjabodetabek P11/S61/T31 |
| 8 | Senayan Mastercard | `SNY` (NS14) | -6.22669, 106.80247 | Underground, single island platform | Transjakarta Corridor 1 (Bundaran Senayan, Senayan Bank Jakarta); Transjabodetabek S61/SH2/T31. Elevated↔underground transition is between ASEAN and Senayan |
| 9 | Istora Mandiri | `IST` (NS13) | -6.22296, 106.80737 | Underground, single island platform | Transjakarta Corridor 1 (Polda Metro Jaya) |
| 10 | Bendungan Hilir | `BNH` (NS12) | -6.21545, 106.81732 | Underground, single island platform | Transjakarta Corridor 1 (Bendungan Hilir, Karet) |
| 11 | Setiabudi Astra | `STB` (NS11) | -6.20993, 106.82152 | Underground, single island platform | — |
| 12 | Dukuh Atas BNI | `DKA` (NS10) | -6.20095, 106.82281 | Underground, single island platform | **Major hub:** KRL (BNI City, Sudirman), Soekarno–Hatta Airport Rail Link, LRT Jakarta + LRT Jabodebek (Dukuh Atas), Transjakarta Corridors 1/4/6 |
| 13 | Bundaran HI Bank Jakarta | `BHI` (NS09) | -6.19341, 106.82286 | Underground, single island platform | **Phase 1 terminus.** Directly integrated with the Transjakarta *Bundaran HI Astra* BRT station — stairs only, **not wheelchair accessible**. Renamed from "Bundaran Hotel Indonesia" via the Oct 2024 Bank DKI naming-rights deal, then to "Bank Jakarta" in Jul 2025 |

Sources: [MRT Jakarta API](https://beweb-dev.jakartamrt.co.id/middleware/api/datum),
[en.wikipedia – North–South Line](https://en.wikipedia.org/wiki/North%E2%80%93South_Line_(Jakarta_MRT)),
[en.wikipedia – Bundaran HI Bank Jakarta MRT station](https://en.wikipedia.org/wiki/Bundaran_HI_Bank_Jakarta_MRT_station),
[id.wikipedia – Jalur Utara–Selatan](https://id.wikipedia.org/wiki/Jalur_Utara%E2%80%93Selatan_(MRT_Jakarta)).

### 2.3 North–South Line — Phase 2A / 2B (not yet in service)

| # | Station | Code | Coordinates | Notes |
|---|---|---|---|---|
| 14 | Thamrin | — | `null` | Planned **NS↔EW interchange**; Transjakarta Corridor 1 (Kebon Sirih). No id.wikipedia article, no verifiable coordinate |
| 15 | Monas (Monumen Nasional) | — | `null` | Inside the National Monument complex; Transjakarta Corridors 1/2/3 |
| 16 | Harmoni | — | -6.16572, 106.82028 | Transjakarta Corridor 1 (Harmoni) |
| 17 | Sawah Besar | — | -6.16058, 106.81912 | Transjakarta Corridor 1 (Sawah Besar) |
| 18 | Mangga Besar | — | -6.15122, 106.81731 | Transjakarta Corridor 1 (Mangga Besar) |
| 19 | Glodok | — | -6.14553, 106.81575 | Transjakarta Corridor 1 (Glodok) |
| 20 | Kota | — | -6.13930, 106.81402 | Phase 2A terminus; KRL Bogor & Tanjung Priok lines (Jakarta Kota station), Transjakarta Corridors 1/12 |
| 21 | Mangga Dua | — | `null` | Planned KRL interchange (Kampung Bandan); Transjakarta Corridor 12 |
| 22 | Ancol Park / Ancol Marina | — | `null` | Naming differs: id.wikipedia uses "Ancol Park" + "Ancol Marina"; en.wikipedia uses "Gunung Sahari" + "Ancol"; the operator uses "Ancol Barat" |
| 23 | Ancol Marina / Ancol Barat | — | `null` | Phase 2B terminus + depot |

The Phase 2A station list, the CP201–CP207 contract split, the 5.8 km length and the
2027/2029 segment targets come from the operator's own record:
`"Fase 2A Lin Utara Selatan"`, https://beweb-dev.jakartamrt.co.id/middleware/api/datum.

### 2.4 East–West Line — planned alignment (EW01–EW48, not in service)

The operator's Phase 1 Stage 1 scope is Tomang → Medan Satria (24.5 km) with a 5.9 km
depot spur at Rorotan; the full line is Cikarang ↔ Balaraja, ≈87 km, 48 stations.
All 48 planned station names, with their `EWnn` route numbers, are in the JSON. In order:

**Phase 3B, Banten segment (Balaraja – Karang Tengah, elevated):** Balaraja (EW01),
Cibadak (EW02), Pasir Gadung (EW03), Otonom (EW04), Bunder (EW05), Kadu (EW06),
Bencongan (EW07), Danau Ranau (EW08), Kelapa Dua (EW09), Kebon Nanas (EW10),
Panunggangan (EW11), Kunciran (EW12), Hasyim Asyari (EW13), Karang Tengah (EW14).

**Phase 3A Stage 2 (Kembangan – Arjuna Selatan, elevated):** Kembangan (EW15),
Batu Mulia (EW16), Teknologi (EW17), Kebon Jeruk (EW18), Tanjung Duren (EW19),
Arjuna Selatan (EW20).

**Phase 3A Stage 1 (Tomang – Medan Satria, underground):** Tomang (EW21), Grogol (EW22),
Roxy (EW23), Petojo (EW24), Cideng (EW25), Thamrin (EW26), Kebon Sirih (EW27),
Kwitang (EW28), Senen (EW29), Galur (EW30), Cempaka Baru (EW31), Sumur Batu (EW32),
Pakulonan Barat (EW33), Pakulonan Timur (EW34), Perintis (EW35), Pulo Gadung (EW36),
Penggilingan (EW37), Cakung Barat (EW38), Pulo Gebang (EW39), Ujung Menteng (EW40),
Medan Satria (EW41).

**Phase 3B, West Java segment (Medan Satria – Cikarang, elevated):** Kaliabang (EW42),
Harapan Baru (EW43), Karang Satria (EW44), Sumberjaya (EW45), Wanajaya (EW46),
Cibitung (EW47), Cikarang (EW48).

No coordinates are published for any of these stations (none is built), so all are `null`.
Source: [id.wikipedia – Jalur Timur–Barat](https://id.wikipedia.org/wiki/Jalur_Timur%E2%80%93Barat_(MRT_Jakarta)),
[id.wikipedia – MRT Jakarta](https://id.wikipedia.org/wiki/MRT_Jakarta).

### 2.5 Fares and ticketing (MRT Jakarta)

Progressive fare set on 26 Mar 2019 and effective 1 Apr 2019: **Rp 3,000 minimum,
+Rp 1,000 per station passed, maximum Rp 14,000** (Lebak Bulus ↔ Bundaran HI).
Payment: Kartu Jelajah single-trip and multi-trip cards, Jak Lingko, bank e-money cards
(Flazz, BRIZZI, e-money, TapCash, BCA OVO, JakCard), credit cards, MyMRTJ app
(+ MyMRTJ Lite self-service ticket machines, MyMRTJ Chat, QRIS Tap).
Source: [id.wikipedia – MRT Jakarta § Tarif](https://id.wikipedia.org/wiki/MRT_Jakarta).

---

## 3. LRT Jakarta

**Operator:** PT LRT Jakarta — a subsidiary of PT Jakarta Propertindo (Perseroda)
(Jakpro group), established by Governor's Regulation No. 154/2017.
Official site: <https://lrtjakarta.co.id/> (also `www.lrtjakarta.co.id`).
Vehicle: Hyundai Rotem, 750 V DC third rail, standard gauge, 16 LRVs (8-car sets),
top speed 90 km/h, 10–15 min headway.

### 3.1 The single elevated line — 11 stations, 12.2 km

Line code `S` ("Lin Selatan" / South Line). Operating **Kelapa Gading ↔ Manggarai**.

| # | Official station name | Code | Coordinates | Notes |
|---|---|---|---|---|
| 1 | **Stasiun LRT Pegangsaan Dua (Kelapa Gading)** | `KPG` (S-01) | -6.15759, 106.91408 | Northern terminus; **depot and head office** (Gedung MCC, Jl. Raya Kelapa Nias, Pegangsaan Dua). The operator's JSON-LD names it "Stasiun LRT Pegangsaan Dua (Kelapa Gading)"; id.wikipedia's article is "Stasiun LRT Kelapa Gading" |
| 2 | **Stasiun LRT Boulevard Utara Summarecon Mall** | `BVU` (S-02) | -6.15940, 106.90600 | 120 m covered connecting bridge to Summarecon Mall Kelapa Gading, opened 24 Jul 2025 |
| 3 | **Stasiun LRT Boulevard Selatan** | `BVS` (S-03) | -6.16900, 106.90000 | — |
| 4 | **Stasiun LRT Pulomas** | `PUM` (S-04) | -6.17731, 106.89339 | Transjakarta Corridor 2 (Pulomas). ⚠ id.wikipedia gives this station the *same* coordinate and address as Equestrian — a demonstrable copy-paste error; OSM/Nominatim values used instead |
| 5 | **Stasiun LRT Equestrian** | `EQS` (S-05) | -6.18355, 106.89135 | Next to the Jakarta International Equestrian Park. Same wiki coordinate error as Pulomas; OSM value used. The line article abbreviates this `EQT`, the station article `EQS` |
| 6 | **Stasiun LRT Velodrome** | `VEL` (S-06) | -6.19258, 106.89121 | Southern terminus of the original 5.8 km / 6-station operation; beside the Jakarta International Velodrome; Transjakarta Corridor 4 (Pemuda Rawamangun) |
| 7 | **Stasiun LRT Rawamangun** | `RWM` (S-07) | -6.19323, 106.88367 | First station of the Phase 1B extension; Transjakarta Corridor 4 (Kayu Jati); near Universitas Negeri Jakarta |
| 8 | **Stasiun LRT Pramuka** | `PKA` (S-08) | -6.19202, 106.87063 | Phase 1B. id.wikipedia states trains **do not yet call** here; Transjakarta Corridor 4 (Simpang Pramuka) and Corridor 10 (Pemuda Pramuka) |
| 9 | **Stasiun LRT Matraman** | `MAT` (S-09) | -6.19506, 106.85998 | Phase 1B. id.wikipedia: trains do not yet call; KRL **Kramat** station nearby; Transjakarta Corridor 4/4D (Pasar Genjing) |
| 10 | **Stasiun LRT Proklamasi** | `PKM` (S-10) | -6.20180, 106.84990 | Phase 1B. id.wikipedia: trains do not yet call |
| 11 | **Stasiun LRT Manggarai** | `MGI` (S-11) | -6.20817, 106.84449 | **Southern terminus of the extension, opened 16 Sep 2026.** Major hub: KRL (Bogor/Cikarang/Rangkasbitung), Commuter Line Soekarno–Hatta, Transjakarta Corridor 4/4D, Manggarai bus terminal |

Sources: [lrtjakarta.co.id](https://lrtjakarta.co.id/) (JSON-LD `ItemList` "Daftar Stasiun
LRT Jakarta", 11 items), [lrtjakarta.co.id/schedule](https://lrtjakarta.co.id/schedule),
[id.wikipedia – LRT Jakarta](https://id.wikipedia.org/wiki/LRT_Jakarta) (station table with
`S-01`…`S-10` badges).

### 3.2 Operating pattern, fare and the 2026 Manggarai extension

* **16 Sep 2026** — President **Prabowo Subianto** inaugurated the Kelapa Gading–Manggarai
  service. Total LRT Jakarta length becomes **12.2 km, 11 stations**, ~28 minutes end to
  end; projected 80,000 passengers/day eventually.
  Source: [press release, published 18 Sep 2026](https://lrtjakarta.co.id/press_conference/yAQ95X1p0X).
* **From 24 Sep 2026** — flat fare **Rp 5,000**, headway **15 min**, service
  **05:30–20:00** on Kelapa Gading–Manggarai; after 20:00 the service continues
  Kelapa Gading–Velodrome until **23:00**.
  First 8 days (16–23 Sep 2026): **91,000 passengers**, ~11,300/day — a 166 % increase
  over the 4,245/day average to end-August 2026.
  Source: [press release, 24 Sep 2026](https://lrtjakarta.co.id/press_conference/lgN9gjdpYR).
* Before the extension, LRT Jakarta ran **5.8 km / 6 stations (Pegangsaan Dua–Kelapa Gading
  ↔ Velodrome)** with a 10-minute headway and 05:30–22:30/23:00 hours — this is the
  boilerplate in every press release until September 2026.
* The operator's own site text still contains a stale FAQ answering "six stations";
  the JSON-LD `ItemList` on the same page correctly lists 11.

### 3.3 Planned extensions (not in service)

* **Phase 1C:** Dukuh Atas (LRT) — would connect to MRT Dukuh Atas, KRL BNI City/Sudirman,
  LRT Jabodebek Dukuh Atas and Transjakarta.
* **Phase 2A (North Line):** Kelapa Gading → Kelapa Nias → Boulevard Gading → Sunter Timur →
  Gelanggang Remaja → Sunter Barat → **Jakarta International Stadium** (7 stations).
* **Phase 3A (North Line):** JIS → Martadinata → Benjamin Sueb → Kemayoran → Rajawali.
* **Phase 2B:** Velodrome → Pemuda → Pulo Gadung Barat → Jayakarta → Klender.
* **Phase 3B:** Klender → Pahlawan Revolusi → Pondok Bambu → Kalimalang → Halim
  (Whoosh interchange).
Source: [id.wikipedia – LRT Jakarta](https://id.wikipedia.org/wiki/LRT_Jakarta).

> The brief's "13 stations, Kelapa Gading ↔ JIS" corresponds to neither the operating line
> nor any published phase: Phase 2A (7 stations) + Phase 1A (6) would be 13 only if the
> two north/south halves were joined, which no official document proposes.

### 3.4 Ticket integration with Jakpro

Payment is by **Jak Lingko**-family cards (JakLingko Card, JAK Card), bank e-money
(Flazz, BRIZZI, e-money, TapCash), LinkAja, and the JakLingko app; the operator's own
loyalty card is *Sahabat LRTJ e-Card (SLC)* via the **LRTJ App** (Google Play /
App Store). Special one-day promotional tariffs are set by the DKI Jakarta government
(e.g. Rp 1 on 22 Jun 2025, Rp 80 on 17–18 Aug 2025).
Source: [LRT Jakarta press releases](https://lrtjakarta.co.id/press_conference),
[CARLA care centre](https://lrtjakarta.co.id/faq) (021-508 999 09, Mon–Sun 06:00–22:00 WIB).

---

## 4. LRT Jabodebek

**Operator:** PT Kereta Api Indonesia (Persero) — **Divisi LRT Jabodebek**,ounded at
Jatimulya, Tambun Selatan, Bekasi. Owner: Ditjen Integrasi Transportasi dan Multimoda /
Badan Pengelola Transportasi Jabodetabek. Official site:
<https://lrtjabodebek.kai.id/>. Call centre **121**.
Vehicle: Hyundai Rotem, 750 V DC third rail, standard gauge, **31 train sets**,
90 km/h, 15-minute headway. **Opened 28 Aug 2023** (inaugurated by President Jokowi).
Total Phase 1: **44.3 km, 18 stations, 2 lines.**

### 4.1 Structure

Both lines share a common **Dukuh Atas – Cawang** trunk (8 stations) and then split:
the **Cibubur Line** continues south-east along the Jagorawi corridor to **Harjamukti**
(Depok), the **Bekasi Line** turns east at Cawang to **Halim** and then on to **Jati Mulya**
(Bekasi). The branch point is **Cawang** (`CWG`). The depot is at **Jati Mulya**.

### 4.2 Cibubur Line (`CB`) — Dukuh Atas → Harjamukti, 25.94 km

| # | Station | Code | Coordinates | Interchanges |
|---|---|---|---|---|
| 1 | Dukuh Atas (official fare table: "Dukuh Atas BNI") | `DKA` | -6.20471, 106.82565 | MRT NS Dukuh Atas BNI; KRL Sudirman & BNI City; Commuter Line Soekarno–Hatta; LRT Jakarta (planned); Transjakarta C1 Dukuh Atas, C4/C6 Galunggung; Transjabodetabek B25 |
| 2 | Setiabudi | `SET` | -6.20928, 106.83021 | Transjakarta C6 (Setiabudi Integritas) |
| 3 | Rasuna Said | `RAS` | -6.22175, 106.83226 | Transjakarta C6 (Rasuna Said) |
| 4 | Kuningan | `KUA` | -6.22888, 106.83318 | Transjakarta C6 (Kuningan) |
| 5 | Pancoran (official: "Pancoran bank bjb") | — | -6.24213, 106.83847 | Transjakarta C9 (Pancoran); Transjabodetabek P11 |
| 6 | Cikoko | `CKK` | -6.24348, 106.85710 | KRL Bogor line (Cawang); Transjakarta C9 (Cikoko) |
| 7 | Ciliwung | `CIL` | -6.24348, 106.86413 | Transjakarta C9 (Ciliwung) |
| 8 | **Cawang** | `CWG` | -6.24623, 106.87239 | **Branch point.** KRL Bogor line (Cawang); Transjakarta C7 & C9; Transjabodetabek B11, B21 |
| 9 | Taman Mini (`TMII`) | `TMI` | -6.29287, 106.88054 | Transjakarta C9 (Makasar). Cibubur line only |
| 10 | Kampung Rambutan | `KAM` | -6.30954, 106.88433 | Transjakarta C7; Kampung Rambutan bus terminal; Transjabodetabek S22 |
| 11 | Ciracas | `CRC` | -6.32383, 106.88661 | Cibubur line only |
| 12 | **Harjamukti** | `HAR` | -6.37399, 106.89562 | Terminus. Transjakarta D11; Transjabodetabek D11, P11 (Cibubur Junction) |

### 4.3 Bekasi Line (`BK`) — Dukuh Atas → Jati Mulya, 29.54 km

Stations 1–8 are identical to the Cibubur Line (Dukuh Atas → Cawang), then:

| # | Station | Code | Coordinates | Interchanges |
|---|---|---|---|---|
| 9 | Halim | `HAL` | -6.24647, 106.88524 | **Whoosh** high-speed rail (Halim station). Bekasi line only |
| 10 | Jati Bening Baru | `JBU` | -6.25778, 106.92768 | Bekasi line only |
| 11 | Cikunir 1 | `CK1` | -6.25624, 106.950998 | Bekasi line only |
| 12 | Cikunir 2 | `CK2` | -6.25451, 106.96338 | Bekasi line only |
| 13 | Bekasi Barat | `BEK` | -6.25293, 106.99008 | Transjakarta B1/B3 (Revo Town); Transjabodetabek B11, B25; Pakuwon Mall Bekasi |
| 14 | **Jati Mulya** | `JTM` | -6.26395, 107.02143 | Eastern terminus + **depot**. Transjakarta TWM1, B1; Transjabodetabek B21 |

### 4.4 Fares, payment and integration

Distance-based, three tariff matrices published officially: *off-peak*, *peak*
(06:00–08:59 and 16:00–19:59) and *Saturday/Sunday/public-holiday*. Base fare from
**Rp 5,000** (Dukuh Atas) rising to **Rp 10,000** on the longest trips.
Payment is **cashless only**: bank e-money (BRI, BNI, Mandiri, BCA, Bank DKI cards),
KAI Commuter Multi-Trip Card (KMT), and the KAI Access / LinkAja apps. No paper tickets.
Source: <https://lrtjabodebek.kai.id/informasi-tarif>, <https://lrtjabodebek.kai.id/metode-pembayaran>.

### 4.5 Planned extensions

* **Phase 2, Cibubur–Bogor** (in feasibility study, intended to be mostly at-grade):
  Raffles Hills, Cimanggis, Gunung Putri (KRL Bogor interchange), Cibinong, Sentul Utara,
  Sirkuit Sentul, Sentul Selatan, Bogor Raya, **Baranangsiang** (Bogor bus terminal).
  Source: [id.wikipedia – Lin Cibubur](https://id.wikipedia.org/wiki/Lin_Cibubur).
* Phase 2 also covers a Cikunir–Depok–Bogor corridor and the Dukuh Atas–Senayan service.

---

## 5. KRL Commuter Line (Jabodetabek)

**Operator:** PT Kereta Api Indonesia (Persero) / KAI Commuter (DA 1 Jakarta).
Official site: <https://www.kai.id/>; commuter portal <https://commuterline.id/>
(redirects to <https://www.kci.id/>). App: **KAI Access / KAI Commuter**,
**KAI InJourney**. Historically 1,067 mm gauge; 1,435 mm on newer rolling stock.

### 5.1 Lines in DA 1 Jakarta (post-28 May 2022 restructuring)

| Line | Code | Termini | Stations | Length | Pattern |
|---|---|---|---|---|---|
| Commuter Line Bogor | `B` | Jakarta Kota ↔ Bogor (Nambo shuttle to Nambo since 28 May 2022) | 24 (+23) | 54.8 km (51.0 km to Nambo) | Stopping service since 5 Dec 2011 |
| Commuter Line Cikarang | `C` | Kampung Bandan ↔ Cikarang (and Angke ↔ Cikarang since 28 May 2022) | 29 (+ Pasar Senen) | 87.4 km | The **Lingkar Cikarang** loop, run as a full racket |
| Commuter Line Rangkasbitung | `R` | Tanah Abang ↔ Rangkasbitung | 19 | 72.8 km | Full service since 1 Apr 2017 |
| Commuter Line Tangerang | `T` | Duri ↔ Tangerang | 11 | 19.3 km | — |
| Commuter Line Tanjung Priok | `TP` | Jakarta Kota ↔ Tanjung Priok | 4 | 8.1 km | Full service since 22 Dec 2015 (before: feeder only) |

Source: [id.wikipedia – KRL Commuter Line § Rute](https://id.wikipedia.org/wiki/KRL_Commuter_Line).

### 5.2 Commuter Line Bogor (`B`) — Jakarta Kota → Bogor

`JAKK` Jakarta Kota (also `TP01`) · `JAY` Jayakarta · `MGB` Mangga Besar ·
`SW` Sawah Besar · `JUA` Juanda · `GMR` Gambir *(KRL does not stop — passes through only)* ·
`GDD` Gondangdia · `CKI` Cikini · `MRI` Manggarai (`B09/C13/A01`) · `TEB` Tebet ·
`CW` Cawang (`B11`) · `DRN` Duren Kalibata · `PSMB` Pasar Minggu Baru ·
`PSM` Pasar Minggu · `TNT` Tanjung Barat · `LNA` Lenteng Agung · `UP` Universitas Pancasila ·
`UI` Universitas Indonesia · `POC` Pondok Cina · `DPB` Depok Baru · `DP` Depok ·
`CTA` Citayam (`B22/Bb22`) · `BJD` Bojonggede · `CLT` Cilebut · **Sukaresmi** (`B25`,
no id.wikipedia article ⇒ no verifiable code) · `BOO` Bogor (`B26`, terminus).

**Nambo shuttle (`Bb`):** Citayam (CTA, Bb22) · `PDRG` Pondok Rajeg (Bb23) ·
`CBN` Cibinong (Bb24) · `GPI` Gunung Putri (Bb25) · `NMO` Nambo (Bb26).

### 5.3 Commuter Line Cikarang (`C`) — the loop

The `C` numbering describes the **Lingkar Cikarang**: `C01`–`C14` form a one-way loop
that closes back through **Cawang**, and `C15`–`C26` are the outer spur to Cikarang.

`C01` POK Pondok Jati · `C02` KMT Kramat · `C03` GST Gang Sentiong · `C04` PSE Pasar Senen ·
`C05` KMO Kemayoran · `C06` RJW Rajawali · `C07` KPB Kampung Bandan (`TP02`) · `C08` AK Angke ·
`C09` DU Duri (`T01/A03`) · `C10` THB Tanah Abang (`R01`) · `C11` SUDB BNI City (`A02`) ·
`C12` SUD Sudirman · `C13` MRI Manggarai (`B09/A01`) · `C14` MTR Matraman · **Cawang (CW)** ·
`C15` JNG Jatinegara · `C16` KLD Klender · `C17` BUA Buaran · `C18` KLDB Klender Baru ·
`C19` CUK Cakung · `C20` KRI Kranji · `C21` BKS Bekasi · `C22` BKST Bekasi Timur ·
`C23` TB Tambun · `C24` CIT Cibitung · `C25` TLM Metland Telagamurni · `C26` CKR Cikarang (terminus).

Note: the service runs as a **full racket**, so it may be presented either way round;
the `Cnn` numbers above are the official line-order sequence, not the running order.

### 5.4 Commuter Line Rangkasbitung (`R`)

`R01/C10` THB Tanah Abang · `R02` PLM Palmerah · `R03` KBY Kebayoran · `R04` PDJ Pondok Ranji ·
`R05` JMU Jurangmangu · `R06` SDM Sudimara · `R07` **RU Rawa Buntu** (the article is titled
"Stasiun Rawa Buntu") · `R08` SRP Serpong · `R09` CSK Cisauk · `R10` CC Cicayur ·
`R11` JTK Jatake · `R12` PRP Parung Panjang · `R13` Lumpang Parayasa (no code published) ·
`R14` CJT Cilejit · `R15` DAR Daru · `R16` TEJ Tenjo · `R17` Tigaraksa Podomoro
(no code published) · `R18` TGS Tigaraksa · `R19` CKY Cikoya · `R20` MJ Maja ·
`R21` CTR Citeras · `R22` RK Rangkasbitung (terminus).

### 5.5 Commuter Line Tangerang (`T`)

`T01/C09/A03` DU Duri · `T02` GRG Grogol · `T03` PSG Pesing · `T04` TKO Taman Kota ·
`T05` BOI Bojong Indah · `T06/A03a` RW Rawa Buaya · `T07` KDS Kalideres · `T08` PI Poris ·
`T09` TTI Tanah Tinggi · `T10/T11` TNG Tangerang (terminus).

### 5.6 Commuter Line Tanjung Priok (`TP`)

`TP01/B01` JAKK Jakarta Kota · `TP02/C07` KPB Kampung Bandan · `TP03` AC Ancol ·
`TP04` **JIS Jakarta International Stadium** (also the LRT Jakarta north-line terminus and
the Jakarta International Stadium / JIEP site; Transjakarta Corridor 14) ·
`TP05` TPK Tanjung Priok (terminus, port area).

> **Code note:** the KAI 3-letter code for the shared Manggarai station is `MRI`
> (from the `kode` field of the station article), while LRT Jakarta's own code for the
> same station is `MGI` (from the `code` field, `S-11, MGI`). Both appear in the JSON —
> `MGI` on the LRT Jakarta line, `MRI` on the KRL lines.

### 5.7 Ticketing

Progressive distance-based tariff since 1 Apr 2015. Payment: **KMT** (KAI Commuter
Multi-Trip Card), **THB** (Tiket Harian Berjaminan), bank e-money (Flazz, BRIZZI, e-money,
TapCash, BCA OVO), **LinkAja!**, **Jak Lingko** app, **GoTransit**, **QRIS Tap**,
Access by KAI / C-Access cards, plus the KAI Access and KAI InJourney apps.
Sources: [id.wikipedia – KRL Commuter Line § Tiket elektronik dan tarif](https://id.wikipedia.org/wiki/KRL_Commuter_Line),
[id.wikipedia – KAI Commuter](https://id.wikipedia.org/wiki/KAI_Commuter).

---

## 6. Interchange hubs that connect the rail systems

| Hub | Modes | Notes |
|---|---|---|
| **Dukuh Atas / BNI City / Sudirman** | **MRT NS + KRL + LRT Jabodebek + Commuter Line Soekarno–Hatta + Transjakarta C1/C4/C6** | The largest multi-rail hub in Jakarta. LRT Jakarta's planned Dukuh Atas stop would make it a four-system hub. "Simpang Temu Dukuh Atas" TOD |
| **Manggarai** | **LRT Jakarta (from 16 Sep 2026) + KRL Bogor/Cikarang/Rangkasbitung + Commuter Line Soekarno–Hatta + Transjakarta C4/C4D + bus terminal** | LRT Jakarta's new southern terminus; the key LRT↔KRL interchange |
| **Tanah Abang** | **KRL Cikarang + KRL Rangkasbitung + Transjakarta C1/C3 + bus terminal** | Grand Central; two KRL lines converge |
| **Cawang** | **KRL Bogor + LRT Jabodebek (both lines) + Transjakarta C7/C9** | LRT Jabodebek's branch point |
| **Jakarta Kota** | **KRL Bogor + KRL Tanjung Priok + Transjakarta C1/C12** | MRT Phase 2A "Kota" station will land here |
| **Cibubur / Harjamukti** | LRT Jabodebek Cibubur Line + Transjakarta D11 | KRL Bogor runs to Depok/Cibubur area — a same-corridor but unlinked interchange |
| **Senayan** | MRT NS Senayan Mastercard + Transjakarta C1 | MRT's Senayan station ↔ BRT Bundaran Senayan |
| **Kelapa Gading / Pegangsaan Dua** | LRT Jakarta terminus + depot + Transjakarta (Sunter corridors) | — |
| **Cikarang** | KRL Cikarang terminus + planned MRT EW terminus + Transjakarta W1 | Future 4-mode hub |
| **Halim** | LRT Jabodebek Bekasi Line + **Whoosh** high-speed rail | — |
| **Sudirman / BNI City** | KRL + Commuter Line Soekarno–Hatta + MRT Dukuh Atas + LRT Jabodebek Dukuh Atas | Same TOD complex as Dukuh Atas |

> Note on the brief: "Bundaran HI/BNI City" is **not** a single interchange hub.
> Bundaran HI (MRT terminus) is ~2 km south of BNI City / Dukuh Atas (the KRL–MRT–LRT
> hub). Bundaran HI's only rail interchange today is the Transjakarta BRT station
> directly above it (stairs, not wheelchair accessible).

---

## 7. Official X (Twitter) handles and disruption/announcement channels

Handles were confirmed by fetching each official operator's own website and reading the
social links it publishes, then cross-checking account existence against X's public
oEmbed endpoint (`https://publish.twitter.com/oembed?url=https://x.com/<handle>`).

| System | X (Twitter) | Other official channels | Where service changes are published |
|---|---|---|---|
| **MRT Jakarta** | **@MRTjakartaID** (linked from jakartamrt.co.id's JS bundle) | Instagram **@mrtjkt**, Facebook **/jakartamrt**, Threads **@mrtjkt**, TikTok **@mrtjkt**, YouTube (MRT Jakarta), **MyMRTJ** app (Google Play / App Store), WhatsApp via MyMRTJ Chat | X @MRTjakartaID (operational notices), operator website "Info Terkini" pages, MyMRTJ app push notifications, Jak Lingko / Jakpro channels |
| **LRT Jakarta** | **@lrtjkt** (published in the official site's `sameAs` JSON-LD) | Instagram **@lrtjkt**, Facebook **/lrtjkt**, YouTube **@lrtjakarta**, **LRTJ App** (Google Play `co.id.lrtjakarta.app`), CARLA care centre (021-508 999 09, Mon–Sun 06:00–22:00 WIB, carla@lrtjakarta.co.id) | X @lrtjkt, official site **/schedule** + **/api/schedule/live** (live departure times, no auth), press releases at lrtjakarta.co.id/press_conference, WhatsApp via LRTJ App |
| **LRT Jabodebek** | **@lrtjabodebek** (linked from lrtjabodebek.kai.id) | Instagram **@lrt_jabodebek**, YouTube **@lrtjabodebek**, TikTok **@lrtjabodebek**, Virtual tour at virtualtour-lrtjabodebek.kai.id | X @lrtjabodebek, official site /jadwal-keberangkatan, /informasi-tarif, /siaran-pers, call centre **121**, KAI Access / LinkAja apps, Jak Lingko |
| **KAI / KRL** | **@KAI121** (linked from kai.id) and **@kai_info**; **@KAICommuter** for commuter-specific notices | **KAI Access** app, **KAI InJourney** app, KAI Commuter portal commuterline.id → kci.id, Jak Lingko app, GoTransit | X @KAI121 / @kai_info / @KAICommuter, kai.id "Informasi" and press releases, KAI Access & InJourney push notifications, Jak Lingko / GoTransit, station PA announcements |
| **Transjakarta (context)** | — | Transjakarta app, Jak Lingko | (referenced here only because it is the BRT leg of every interchange above) |

**Verification method / caveat:** X's oEmbed endpoint returned HTTP 200 for
`MRTjakartaID`, `mrtjakarta`, `lrtjkt`, `lrtjabodebek`, `KAI121`, `kai_info` and
`KAICommuter`, and HTTP 404 for a deliberately wrong control (`kai_commuter`). oEmbed
does not return follower counts or verification status, so **handle *existence* is
confirmed but *officiality* is only asserted where the operator's own website links it**.
For MRT Jakarta, LRT Jakarta and LRT Jabodebek the linked handle is the official one.
For KAI, `kai.id` links **@KAI121**; `@kai_info` is a long-standing KAI account but is
*not* the one the current website links, so treat it as secondary.

---

## 8. API / GTFS endpoint test log

Every host below was actually queried with `curl` during this research.

### 8.1 Working endpoints

| Endpoint | Method | Auth | Result |
|---|---|---|---|
| `https://beweb-dev.jakartamrt.co.id/middleware/api/datum` | GET | none (send `Accept: application/json`, `X-Platform: mrt`) | **200** — 25 records: the 13 official MRT station records (with address, `maps` Google link, facility and schedule data) + the "Fase 1 / 2A / EW Fase 1 Tahap 1" project records. This is the operator's own content backend. `pagination[pageSize]` is capped at 100 and total is 25. |
| `https://beweb-dev.jakartamrt.co.id/middleware/api/contents` | GET | none | **200** — site content/news collection |
| `https://beweb-dev.jakartamrt.co.id/middleware/api/navigations` | GET | none | **200** — menu tree |
| `https://beweb-dev.jakartamrt.co.id/middleware/api/parameters` | GET | none | **200** — operational parameters (e.g. travel rules) |
| `https://beweb-dev.jakartamrt.co.id/middleware/media/<path>` | GET | none | **200** — static media |
| `https://lrtjakarta.co.id/api/schedule/live` | GET | none | **200** — **live departure times per station**, refreshed every 30 s by the site. Returns an object keyed by station slug: `kelapa-gading`, `boulevard-utara`, `boulevard-selatan`, `pulomas`, `velodrome`, `rawamangun`, `pramuka`, `equestrian`, `matraman`, `proklamasi`, `manggarai`, each with `timeA`, `timeB`, `listA[]`, `listB[]`. **The single most useful machine-readable feed found in this research.** |
| `https://lrtjakarta.co.id/api/schedules/get?src_station_id=<id>&dst_station_id=<id>` | GET | none | Route is referenced by the site bundle (`api/schedules/get`); a direct hit returns the 404 page, so the exact parameter format still needs to be matched (station ids are on the `/schedule` page's `__NEXT_DATA__`, e.g. `Kre96Z9B5D` = Boulevard Selatan). **Unconfirmed — treat as unverified.** |
| `https://lrtjakarta.co.id/schedule` | GET | none | **200** — full timetable page; station ids + names in `__NEXT_DATA__` |
| `https://lrtjakarta.co.id/` | GET | none | **200** — JSON-LD `ItemList` "Daftar Stations LRT Jakarta" with all 11 official station names, addresses, `openingHours` and `hasMap` links |
| `https://lrtjabodebek.kai.id/stations` | GET | none | **200** — official 18-station Phase 1 list (note: `daftar-stasiun-lrt-jabodebek` 302-redirects here) |
| `https://lrtjabodebek.kai.id/informasi-tarif` | GET | none | **200** — full fare matrix (peak/off-peak/SML) with the official station-name list |
| `https://lrtjabodebek.kai.id/jadwal-keberangkatan` | GET | none | **200** — timetable (≈3.8 MB of server-rendered HTML) |
| `https://lrtjabodebek.kai.id/rute-integrasi` | GET | none | **200** — integration routes |
| `https://api.kai.id/msvc-webcorp/api/v2/media/<id>/<file>` | GET | none | **200** — KAI's media CDN (used by www.kai.id). The only `api.kai.id` route confirmed to resolve. |
| `https://www.kai.id/` | GET | none | **200** — Next.js site; `api.kai.id` is its content API |

### 8.2 Endpoints tested that do NOT exist (recorded so nobody re-tests them)

| Endpoint | Result |
|---|---|
| `https://api.mrtjakarta.co.id/…` (`/v1/stations`, `/v1/realtime`, `/v1/schedules`, `/`) | **DNS SERVFAIL** — host does not resolve. The old `mrtjakarta.co.id` domain is dead; the operator is at `jakartamrt.co.id` |
| `https://gtfs.mrtjakarta.co.id/gtfs.zip` | **DNS SERVFAIL** — no such host |
| `https://gtfs.kai.id/gtfs.zip` | **DNS NXDOMAIN** |
| `https://data.kai.id/` and `…/gtfs.zip` | **DNS NXDOMAIN** (host does not exist) |
| `https://commuter.kai.id/`, `https://commuters.kai.id/` | **DNS NXDOMAIN** — the commuter portal is now `commuterline.id` → `www.kci.id` |
| `https://www.kai.id/gtfs.zip`, `https://api.kai.id/msvc-webcorp/api/v2/gtfs.zip` | **404** |
| `https://api.kai.id/` + ~40 guessed paths (`/stations`, `/api/stations`, `/v1/stations`, `/api/train`, `/api/jadwal`, `/api/commuter`, `/api/gtfs`, `/swagger`, `/openapi.json`, `/msvc-webcorp/api/v2/{stations,jadwal,news,commuter,lrt,locations}`, …) | **404** for all of them — `{"message":"no route and no API found with those values"}` |
| `https://www.kci.id/` | **403** — Cloudflare interstitial; not machine-readable from outside |
| `https://transitfeeds.com/p/indonesia-jakarta-krl-commuter` | **403** |
| `https://api.mobilitydatabase.org/v1/feeds?country_code=ID` | **302** redirect loop / unusable from this environment |
| Overpass API (`overpass-api.de`, `overpass.kumi.systems`) | **406** — blocked by the sandbox egress proxy. OpenStreetMap was therefore accessed via the **Nominatim** geocoder and the **OSM API** (`api.openstreetmap.org/api/0.6/map`), both of which work |

### 8.3 GTFS conclusion

**No operator among the four publishes a GTFS feed at any discoverable URL.** There is no
`gtfs.*` host for MRT Jakarta, LRT Jakarta, LRT Jabodebek or KAI; `data.kai.id` does not
resolve; and neither the MobilityDatabase nor Transitland exposes an Indonesian GTFS
feed from this environment. Practical implications for the platform:

1. Build the static route/station tables from the JSON in `data/rail-jakarta.json`.
2. For **live** departures, the only working public feed found is
   `https://lrtjakarta.co.id/api/schedule/live` (LRT Jakarta). LRT Jabodebek's
   `/jadwal-keberangkatan` page and KAI's KAI Access / InJourney apps are the practical
   real-time sources for the other operators.
3. Monitor the X accounts in §7 for disruption/service-change announcements — that is
   the channel all four operators actually use for unplanned changes.

---

## 9. Uncertainties and caveats

1. **MRT East–West Line station list is a plan, not a built asset.** The 48 EW codes and
   names come from id.wikipedia and the operator's project description; naming has
   changed between plan revisions (e.g. "Gunung Sahari" vs "Ancol Park") and no
   coordinates exist because nothing is built.
2. **MRT Phase 2A/2B naming.** "Monas" vs "Monumen Nasional"; "Ancol" vs "Ancol Park" /
   "Ancol Marina" / "Ancol Barat"; "Kota" vs "Bundaran HI–Kota". Recorded in note fields.
3. **KRL line numbering vs service pattern.** The `C` (Cikarang) codes describe the
   historical loop, which is now run as a full racket between Kampung Bandan/Angke and
   Cikarang; the running order is not simply C01→C26. The `B`/`Bb` split reflects the
   Nambo shuttle, which only calls at a subset of Bogor-line stations.
4. **Missing / unverified station codes:** KRL *Sukaresmi* (no id.wikipedia article),
   *Tigaraksa Podomoro* and *Lumpang Parayasa* (no code in their infoboxes);
   LRT Jakarta *Manggarai* shares the KRL code `MGI`; LRT Jabodebek *Pancoran* has no
   3-letter code (the official fare table calls it "Pancoran bank bjb").
5. **Coordinate provenance.** 147 of 202 entries carry coordinates. Where id.wikipedia
   and Wikidata disagree slightly (sub-100 m), the article's own `{{coord}}` value was
   preferred. The LRT Jakarta *Pulomas* and *Equestrian* articles were found to carry
   identical coordinates and identical addresses — a clear copy-paste error — so OSM
   (Nominatim) values were used and the discrepancy is flagged in the notes.
6. **LRT Jakarta station naming is in flux.** The operator's JSON-LD says "Stasiun LRT
   Pegangsaan Dua (Kelapa Gading)" while Wikipedia says "Stasiun LRT Kelapa Gading"; the
   same class of divergence applies to "Pancoran bank bjb" (LRT Jabodebek) and
   "Dukuh Atas BNI" vs "Dukuh Atas Bank Syariah Indonesia". The JSON uses the operator's
   own wording where a fare table or JSON-LD provides it, and the common name otherwise.
7. **Operator websites are Next.js/Strapi SPAs.** Content lives behind a JSON API, and
   some records are still served from a `-dev` host (`beweb-dev.jakartamrt.co.id`) that
   the production site itself calls. Expect the host names to change; treat the API
   shapes, not the host names, as the contract.
8. **KAI's commuter portal (`commuterline.id` → `www.kci.id`) is Cloudflare-protected**
   and could not be scraped. KAI's public API surface outside the media CDN is unknown
   from this environment.
9. **The `web_search` tool was unavailable** (HTTP 401 from the search backend). Search
   was performed via direct `curl` against Bing; a reproducible helper is at
   `research/tools/search.py`.
10. **Wikipedia is the main coordinate and code source here.** It is well maintained for
    these systems but is not authoritative for fare or service changes — always prefer
    the operator pages in §8.1 for those.

---

## 10. Source list (all URLs fetched during this research)

**MRT Jakarta**
- <https://www.jakartamrt.co.id/> (site + JS bundle → API base, X handle @MRTjakartaID)
- <https://beweb-dev.jakartamrt.co.id/middleware/api/datum> (official station + project records)
- <https://beweb-dev.jakartamrt.co.id/middleware/api/contents>
- <https://beweb-dev.jakartamrt.co.id/middleware/api/navigations>
- <https://beweb-dev.jakartamrt.co.id/middleware/api/parameters>
- <https://en.wikipedia.org/wiki/North%E2%80%93South_Line_(Jakarta_MRT)>
- <https://en.wikipedia.org/wiki/Bundaran_HI_Bank_Jakarta_MRT_station>
- <https://id.wikipedia.org/wiki/MRT_Jakarta>
- <https://id.wikipedia.org/wiki/Jalur_Utara%E2%80%93Selatan_(MRT_Jakarta)>
- <https://id.wikipedia.org/wiki/Jalur_Timur%E2%80%93Barat_(MRT_Jakarta)>
- <https://jakartamrt.co.id/id/proyek/fase-2>

**LRT Jakarta**
- <https://lrtjakarta.co.id/> (JSON-LD station list + `sameAs` social links)
- <https://lrtjakarta.co.id/schedule>
- <https://lrtjakarta.co.id/api/schedule/live>
- <https://lrtjakarta.co.id/press_conference/yAQ95X1p0X> (16 Sep 2026 Manggarai inauguration)
- <https://lrtjakarta.co.id/press_conference/lgN9gjdpYR> (24 Sep 2026 operating pattern + ridership)
- <https://lrtjakarta.co.id/sitemap.xml>
- <https://id.wikipedia.org/wiki/LRT_Jakarta>

**LRT Jabodebek**
- <https://lrtjabodebek.kai.id/stations>
- <https://lrtjabodebek.kai.id/informasi-tarif>
- <https://lrtjabodebek.kai.id/lrt-guides>
- <https://lrtjabodebek.kai.id/jadwal-keberangkatan>
- <https://lrtjabodebek.kai.id/rute-integrasi>
- <https://id.wikipedia.org/wiki/LRT_Jabodebek>
- <https://id.wikipedia.org/wiki/Lin_Cibubur>
- <https://id.wikipedia.org/wiki/Lin_Bekasi>

**KRL**
- <https://www.kai.id/>
- <https://commuterline.id/> (→ <https://www.kci.id/>)
- <https://id.wikipedia.org/wiki/KRL_Commuter_Line>
- <https://id.wikipedia.org/wiki/KAI_Commuter>
- <https://id.wikipedia.org/wiki/Commuter_Line_Bogor>
- <https://id.wikipedia.org/wiki/Commuter_Line_Cikarang>
- <https://id.wikipedia.org/wiki/Commuter_Line_Rangkasbitung>
- <https://id.wikipedia.org/wiki/Commuter_Line_Tangerang>
- <https://id.wikipedia.org/wiki/Commuter_Line_Tanjung_Priok>

**Tooling / helpers written for this task**
- `research/tools/wiki_fetch.py` — Wikipedia wikitext fetch + infobox extraction
- `research/tools/wikibulk.py` — bulk fact extraction (en/id)
- `research/tools/stations.py` — station fact harvester (code, coords, opening, platforms)
- `research/tools/parse_tables.py` — ordered station-list parser for wikitext tables
- `research/tools/search.py` — Bing HTML search fallback (built-in web_search was 401)
- `research/tools/build_json.py` — builds `data/rail-jakarta.json` from harvested data
