# Transjakarta (PT Transportasi Jakarta) — research dossier

**Compiled:** 20 October 2026 (WIB) · **Region:** DKI Jakarta, Indonesia · **Mode:** bus (BRT + feeder network)

Primary sources: the official PT Transportasi Jakarta website (`transjakarta.co.id`, including the official per-route *peta rute* images served from `smk.transjakarta.co.id`), the Indonesian Wikipedia articles *Transjakarta*, *Mikrotrans* and *Layanan pengumpan dalam kota (Transjakarta)*, the per-corridor Wikipedia articles *Koridor N Transjakarta*, and OpenStreetMap via the Overpass API.

---

## 1. Executive summary — the four service classes

Transjakarta's network is not one service but **four distinct classes**, which the official website and the media label inconsistently:

| # | Class | Official site label | Vehicle | Route codes | Count |
|---|-------|--------------------|---------|-------------|-------|
| 1 | **BRT** (koridor utama + rute lintas koridor) | `BRT` | Full-size bus, 12 m articulated or single deck, on segregated busway (or street-running where no busway exists) | `1`–`14` plus variants `2A 3F 3H 4D 5C 6A 6B 6V 7F 9A 9C 9N 10H 13B 13E L13E` | **30 routes** |
| 2 | **Mikrotrans** (small bus feeder, JakLingko) | `Mikrotrans` | 7-seater minibus (Suzuki Carry 1.5 Real Van, Daihatsu Gran Max, Mitsubishi) | `JAK.01`–`JAK.120` + lettered variants | **99 routes** |
| 3 | **MiniTrans** (medium bus feeder) | *no official label — published under `Angkutan Pengumpan`* | Medium bus (Mitsubishi Colt FE 84G, Hino FB 130) | Same numeric+letter codes as class 4, but a distinct vehicle/operator subset | **59 routes attributed** |
| 4 | **Angkutan Pengumpan** (non-BRT city routes) | `Angkutan Pengumpan` | Single-deck city bus (Mercedes OH 1526/1626, Scania K250UB, BYD B12, Skywell NJL6129BEV, Zhongtong N12, Golden Dragon Pivot E12) | `1A 1B 1C 1E 1F 1H 1M 1P 1Q 1R 1W 2B 2P 2Q 3D 3E 4B 4C 4F 4K 5B 5F 5M 5N 6C 6D 6H 6K 6M 6N 6Q 6T 6U 6W 7A 7B 7C 7D 7E 7P 7Q 7R 7T 7U 7V 7W 8C 8D 8E 8K 8M 8N 9D 9E 9H 11D 11Q 11W 12A 12B 12P 14A 14B 51ST` | **64 routes** |

**Terminology findings (important for a data platform):**

* **"Minitrans"** is *not* a term used by transjakarta.co.id. Per [id.wikipedia.org/wiki/Transjakarta](https://id.wikipedia.org/wiki/Transjakarta): the non-BRT feeder fleet is split by vehicle size into **bus besar** (Reguler / **MetroTrans**), **bus sedang** (**MiniTrans**) and **bus kecil** (**Mikrotrans**). The medium buses are operated by *Trans Swadaya, Jewa Dian Mitra, Bayu Holong Persada, Pusaka Satria Utama (Bluebird) and Sentra Glosia Indonesia* "as MiniTrans". The same article separately notes that *Metrotrans* and *Minitrans* "masih membolehkan penumpang pria duduk di area depan", unlike the blue BRT buses with a women-only front section. Media usage is looser and sometimes uses "Minitrans" as a catch-all for any small feeder bus — so the term is used inconsistently and should be stored as a vehicle-class attribute, not a route prefix.
* **"JAKPRO"** and **"JRegular"** could **not** be verified as Transjakarta service classes. Neither string appears in the official site or in the relevant Wikipedia articles. In Indonesian transit usage *Jakpro* normally refers to the Jabodetabek regulator (Badan Pengatur Transportasi Jabodetabek) and its **Transjabodetabek** cross-province routes (`B11 B13 B21 BW4 D11 D21 M3 M4 M5 M8 M14 S11 S12 S21 S22 SH1 …`) — a different network. The current official term for the non-BRT in-city routes is **Angkutan Pengumpan**.
* **Corridor 15, 16, 17, 18 do not exist.** [id.wikipedia.org/wiki/Koridor_15_Transjakarta](https://id.wikipedia.org/wiki/Koridor_15_Transjakarta) is only a redirect to the main Transjakarta article, and corridors 16–18 have no article. The network is **14 trunk corridors**, and the newest are **13 (Ciledug–Tegal Mampang)** and **14 (Jakarta International Stadium–Senen)**.

---

## 2. BRT — trunk corridors (koridor utama)

Source: [transjakarta.co.id/layanan/brt](https://transjakarta.co.id/layanan/brt) and the *Koridor Utama* table in [id.wikipedia.org/wiki/Transjakarta](https://id.wikipedia.org/wiki/Transjakarta).

| Corridor | Official route name | Length (km) | Halte (official map) | Operator(s) |
|---|---|---|---|---|
| **1** | BLOK M - KOTA | 15.48 | 22 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI, Bianglala Metropolitan |
| **2** | PULO GADUNG  - MONUMEN NASIONAL | 17.88 | 22 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI, Steady Safe, Pahala Kencana |
| **3** | KALIDERES - MONUMEN NASIONAL VIA VETERAN | 16.14 | 14 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Steady Safe |
| **4** | PULO GADUNG - GALUNGGUNG | 12.33 | 20 | PT Transportasi Jakarta (swakelola), Perum DAMRI, Steady Safe |
| **5** | KAMPUNG MELAYU - ANCOL | 13.58 | 18 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI, Steady Safe |
| **6** | RAGUNAN - GALUNGGUNG | 15.9 | 19 | Mayasari Bakti, Perum DAMRI, Bianglala Metropolitan |
| **7** | KAMPUNG MELAYU - KAMPUNG RAMBUTAN | 12.57 | 14 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI |
| **8** | LEBAK BULUS - PASAR BARU | 25.33 | 26 | Mayasari Bakti, Perum DAMRI, Bianglala Metropolitan |
| **9** | PINANG RANTI - PLUIT | 31.57 | 26 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI |
| **10** | TANJUNG PRIOK - PGC | 19.11 | 22 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI, Steady Safe, Sinar Jaya |
| **11** | PULO GEBANG - KAMPUNG MELAYU | 13.86 | 16 | Steady Safe |
| **12** | PLUIT - TANJUNG PRIOK | 23.3 | 23 | PT Transportasi Jakarta (swakelola), Perum DAMRI |
| **13** | CILEDUG - TEGAL MAMPANG | 14.18 | 15 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI, Bianglala Metropolitan |
| **14** | JAKARTA INTERNATIONAL STADIUM - SENEN | 9.7 | 10 | PT Transportasi Jakarta (swakelola), Sinar Jaya |

**Notes on the 14 trunk corridors**

* Corridor 1 now runs **Blok M – Kota**; its northern terminus on the official map is the **Kali Besar** halte, with **Museum Sejarah Jakarta** and the MRT-connected **Kota** halte immediately after. OSM agrees (`Transjakarta BRT 1: Kali Besar → Blok M`, 22 stop nodes).
* Corridor 3 has three published variants: `3` (Kalideres – Monumen Nasional via Veteran, 24 h), `3F` (Kalideres – Senayan Bank Jakarta) and `3H` (Damai – Kota).
* Corridor 4 has `4` (Pulo Gadung – Galunggung, 24 h) and `4D` (Pulo Gadung – Kuningan).
* Corridor 5 has `5` (Kampung Melayu – Ancol, 24 h) and `5C` (Cililitan – Juanda).
* Corridor 6 has `6` (Ragunan – Galunggung, 24 h), `6A` (Ragunan – Balai Kota via Kuningan), `6B` (Ragunan – Balai Kota via Semanggi) and `6V` (Ragunan – Senayan Bank Jakarta).
* Corridor 7 has `7` (Kampung Melayu – Kampung Rambutan, 24 h) and `7F` (Kampung Rambutan – Juanda via Cempaka Putih — peak-hour only, 05:00–09:00 and 15:00–21:00).
* Corridor 9 has `9` (Pinang Ranti – Pluit, 24 h), `9A` (Cililitan – Grogol), `9C` (Pinang Ranti – Bundaran Senayan) and `9N` (Pinang Ranti – Simpang Cawang — **weekends only**).
* Corridor 10 has `10` (Tanjung Priok – PGC, 24 h) and `10H` (Tanjung Priok – Bundaran Senayan).
* Corridor 13 has `13` (Ciledug – Tegal Mampang), `13B` (Puri Beta – Pancoran) and `13E` (Puri Beta 2 – Flyover Kuningan, **weekends only**) plus the weekday-only express `L13E`.
* Corridor 14 (**Jakarta International Stadium – Senen**) is the newest corridor; the official map is dated 5 June 2026. It runs JIS → Jembatan Item → Danau Sunter → Danau Agung → Landasan Pacu → JIExpo Kemayoran → Kemayoran → Tanah Tinggi → Senen TOYOTA Rangga → Senen Raya. Wikipedia notes its route length is only 9.7 km with 10 halte — the lowest of any corridor — and it carried only 525,643 passengers in 2024 because it opened mid-year.

### 2.1 Cross-corridor / express BRT routes

Operated on the BRT alignment but running across corridor boundaries so riders avoid transiting. Published on the same official page; each has its own route map.

| Route | Name | Length (km) | Halte | Operator(s) |
|---|---|---|---|---|
| **10H** | TANJUNG PRIOK - BUNDARAN SENAYAN | n/a | 16 | Mayasari Bakti, Steady Safe |
| **13B** | PURI BETA - PANCORAN | n/a | 16 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI |
| **13E** | PURI BETA - FLYOVER KUNINGAN | n/a | 23 | Mayasari Bakti, Perum DAMRI, Bianglala Metropolitan |
| **2A** | PULO GADUNG  - RAWA BUAYA | n/a | 25 | Mayasari Bakti, Perum DAMRI, Steady Safe, Pahala Kencana |
| **3F** | KALIDERES - SENAYAN BANK JAKARTA | n/a | 17 | Mayasari Bakti, Steady Safe |
| **3H** | DAMAI - KOTA | n/a | 13 | PT Transportasi Jakarta (swakelola), Steady Safe |
| **4D** | PULO GADUNG  - KUNINGAN | n/a | 25 | PT Transportasi Jakarta (swakelola), Perum DAMRI |
| **5C** | CILILITAN  - JUANDA | n/a | 24 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI, Steady Safe |
| **6A** | RAGUNAN - BALAI KOTA VIA KUNINGAN | n/a | 21 | Mayasari Bakti, Perum DAMRI, Bianglala Metropolitan |
| **6B** | RAGUNAN - BALAI KOTA VIA SEMANGGI | n/a | 20 | Mayasari Bakti, Perum DAMRI, Bianglala Metropolitan |
| **6V** | RAGUNAN - SENAYAN BANK JAKARTA | n/a | 17 | Bianglala Metropolitan |
| **7F** | KAMPUNG RAMBUTAN - JUANDA VIA CEMPAKA PUTIH | n/a | 23 | Perum DAMRI |
| **9A** | CILILITAN - GROGOL | n/a | 19 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Steady Safe |
| **9C** | PINANG RANTI - BUNDARAN SENAYAN | n/a | 16 | PT Transportasi Jakarta (swakelola), Mayasari Bakti, Perum DAMRI |
| **9N** | PINANG RANTI - SIMPANG CAWANG | n/a | 4 | Mayasari Bakti |
| **L13E** | PURI BETA - FLYOVER KUNINGAN (EXPRESS) | n/a | 15 | PT Transportasi Jakarta (swakelola), Mayasari Bakti |

### 2.2 Service classes and operating hours

The official route maps carry an operating-pattern table. Legend used on every map:

* `WD` = weekday (Hari Kerja) · `WE` = weekend (Akhir Pekan) · `D` = daily (Harian) · `N` = night (Malam)
* `AM` / `PM` = peak-hour-only service (05:00–09:00 and 15:00–21:00)
* `D+N` on the map means the corridor runs 24 hours: `D` 05:00–23:59 and `N` 23:59–05:00

| Corridor | Days | First / last departure |
|---|---|---|
| 1 | WD+WE, D 00.00-23.59 both directions | |
| 2 | WD+WE, D 00.00-23.59 | |
| 3 | WD+WE, D+N 00.00-23.59 | |
| 4 | WD+WE, D+N 00.00-23.59 | |
| 5 | WD+WE, D+N 00.00-23.59 | |
| 6 | WD+WE, D+N 00.00-23.59 | |
| 7 | WD+WE, D+N 00.00-23.59 | |
| 8 | WD+WE, D+N 00.00-23.59 | |
| 9 | WD+WE, D+N 00.00-23.59 | |
| 10 | WD+WE, D+N 00.00-23.59 | |
| 11 | WD+WE, D+N 00.00-23.59 | |
| 12 | WD+WE, D+N 00.00-23.59 | |
| 13 | WD+WE, D 05.00-22.00, N 22.00-05.00 | |
| 14 | WD+WE, D+N 00.00-23.59 | |
| 2A | WD+WE, D 05.00-22.00 | |
| 3F | WD+WE, D 05.00-22.00 | |
| 3H | WD+WE, D 05.00-22.00 | |
| 4D | WD+WE, D 05.00-22.00 | |
| 5C | WD+WE, D 05.00-22.00 | |
| 6A | WD+WE, D 05.00-22.00 | |
| 6B | WD+WE, D 05.00-22.00 | |
| 6V | WD+WE, D 05.00-22.00 | |
| 7F | WD+WE, AM 05.00-09.00, PM 15.00-21.00 | |
| 9A | WD+WE, D 05.00-22.00 | |
| 9C | WD+WE, D 05.00-22.00 | |
| 9N | WE only (weekend), D 05.00-22.00 | |
| 10H | WD+WE, D 05.00-22.00 | |
| 13B | WD+WE, D 05.00-22.00 | |
| 13E | WE only (weekend), D 05.00-22.00 | |
| L13E | WD only (weekday), D 05.00-22.00 | |

---

## 3. BRT — halte lists in route order

Transcribed from the official route maps (each map is stamped *"Informasi per \<date>"*). Coordinates are in the JSON file (OpenStreetMap, WGS84).

### 1 — BLOK M - KOTA

*Service pattern:* WD+WE, D 00.00-23.59 both directions
*Length:* 15.48 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/1-20260714.jpeg

> Kali Besar → Museum Sejarah Jakarta → Kota → Glodok → Taman Sari → Mangga Besar → Sawah Besar → Harmoni → Monumen Nasional → Kebon Sirih → M.H Thamrin → Bundaran HI ASTRA → Tosari → Dukuh Atas → Karet → Bendungan Hilir → Polda Metro Jaya → Senayan Bank Jakarta → Bundaran Senayan → Masjid Agung → ASEAN → Blok M

### 2 — PULO GADUNG  - MONUMEN NASIONAL

*Service pattern:* WD+WE, D 00.00-23.59
*Length:* 17.88 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/2-20260324.jpeg

> Monumen Nasional → Pecenongan → Juanda → Istiqlal → Gambir → Pejambon → RSPAD → Senen Raya | Balai Kota → Gambir 2 → Kwitang → Senen TOYOTA Rangga → Galur → Rawa Selatan → Pasar Cempaka Putih → Cempaka Baru → Sumur Batu → Cempaka Mas → Pedongkelan → Perintis Kemerdekaan → Pulomas → Bermis → Pulo Gadung

### 3 — KALIDERES - MONUMEN NASIONAL VIA VETERAN

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 16.14 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/3-20260324.jpeg

> Kalideres → Pesakih → Sumur Bor → Rawa Buaya → Jembatan Baru → Pulo Nangka → Jembatan Gantung → Taman Kota → Damai → Jelambar → Grogol → Roxy → Petojo → Monumen Nasional

### 4 — PULO GADUNG - GALUNGGUNG

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 12.33 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/4-20260506.jpeg

> Pulo Gadung → Pasar Pulo Gadung → Pemuda Merdeka → Layur → Pemuda Rawamangun → Velodrome → Kayu Jati → Rawamangun → Simpang Pramuka 1/2 → Pramuka Sari → Utan Kayu → Pasar Genjing → Flyover Pramuka → Matraman → Tegalan → Kesatrian → Manggarai Temporer 1/2 → Pasar Rumput → Halimun → Galunggung

### 5 — KAMPUNG MELAYU - ANCOL

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 13.58 km — Per-corridor Wikipedia infobox states 13.53 km; the 'Koridor Utama' summary table states 13.58 km. The latter is used here.
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/5-20250909.jpg

> Kampung Melayu → Jatinegara → Bali Mester → Matraman Baru → Kesatrian → Tegalan → Matraman → Paseban → Salemba → Kramat Sentiong → Pal Putih → Jaga Jakarta → Lapangan Banteng → Pasar Baru Timur → Jembatan Merah → Gunung Sahari → Pademangan → Ancol

### 6 — RAGUNAN - GALUNGGUNG

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 15.9 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/6-20261006.jpeg

> Ragunan → Simpang Ragunan Ar-Raudhah → Jati Barat → Jati Padang → Pejaten → Buncit Indah → Warung Jati → Warung Buncit → Duren Tiga → Mampang Prapatan → Underpass Kuningan → Patra Kuningan → Kuningan → Rasuna Said → Karet Kuningan → Kuningan Madya → Setiabudi Integritas → Flyover Kuningan → Galunggung

### 7 — KAMPUNG MELAYU - KAMPUNG RAMBUTAN

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 12.57 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/7-20250312.jpg

> Kampung Melayu → Bidara Cina → Gelanggang Remaja → Cawang Baru → Cawang → Cawang Sentral → Cawang Cililitan → Cililitan → Kramat Jati → Pasar Induk → Trikora → Flyover Raya Bogor → Tanah Merdeka → Kampung Rambutan

### 8 — LEBAK BULUS - PASAR BARU

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 25.33 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/8-20250102.jpg

> Pasar Baru → Juanda → Pecenongan → Petojo → Tarakan → Tomang Raya → Tanjung Duren → Grogol Reformasi → Jelambar → Damai → Kedoya → Kedoya Panjang → Duri Kepa → Kebon Jeruk → Kelapa Dua Sasak → Pos Pengumben → Arteri → Permata Hijau → Simprung → Kebayoran → Bungur → Tanah Kusir → Pondok Indah → Underpass Lebak Bulus → Pondok Pinang → Lebak Bulus

### 9 — PINANG RANTI - PLUIT

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 31.57 km — Per-corridor Wikipedia infobox states 28.8 km; the 'Koridor Utama' summary table states 31.57 km. The latter is used here.
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/9-20250312.jpg

> Pinang Ranti → Makasar → Cawang Sentral → Cawang → Ciliwung → Cikoko → Tebet Eco Park → Pancoran Tugu → Pancoran → Tegal Parang → Simpang Kuningan → Denpasar → Widya Chandra Telkomsel → Semanggi → Gerbang Pemuda → Petamburan → Kemanggisan → Kota Bambu → Tanjung Duren → Grogol Reformasi → Kali Grogol → Jembatan Besi → Jembatan Dua → Jembatan Tiga → Penjaringan → Pluit

### 10 — TANJUNG PRIOK - PGC

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 19.11 km — Per-corridor Wikipedia infobox states 19.4 km; the 'Koridor Utama' summary table states 19.11 km. The latter is used here.
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/10-20250312.jpg

> Tanjung Priok → Mambo → Koja → Walnutaka Jakarta Utara → Plumpang → Sunter Kelapa Gading → Kodamar → Simpang Cempaka → Cempaka Putih → Pulomas Bypass → Kayu Putih Rawasari → Pemuda Pramuka → Utan Kayu Rawamangun → Pisangan → Flyover Jatinegara → Pedati Perumping → Kebon Nanas → Halim → Simpang Cawang → Cawang Sentral → Cawang Cililitan → PGC

### 11 — PULO GEBANG - KAMPUNG MELAYU

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 13.86 km — Per-corridor Wikipedia infobox states 15.0 km; the 'Koridor Utama' summary table states 13.86 km. The latter is used here.
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/11-20250102.jpg

> Kampung Melayu → Jatinegara → Stasiun Jatinegara(KCI) → Flyover Jatinegara → Pasar Enjo → Flyover Cipinang → Cipinang → Stasiun Klender(KCI) → Klender → Kampung Sumur → Buaran → Simpang Buaran → Flyover Pontecoco → Penggilingan → Walikota Jakarta Timur → Pulo Gebang

### 12 — PLUIT - TANJUNG PRIOK

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 23.3 km — Per-corridor Wikipedia infobox states 18.85 km; the 'Koridor Utama' summary table states 23.3 km. The latter is used here.
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/12-20250102.jpg

> Tanjung Priok → Mambo → Koja → Walikota Jakarta Utara → Plumpang → Sunter Kelapa Gading → Sunter Boulevard Barat → Sunter Karya → Sunter Utara → Danau Agung → Landasan Pacu → Jembatan Merah → Gunung Sahari → Mangga Dua → Mangga Dua Raya → Kota → Museum Sejarah Jakarta → Gedong Panjang → Pakin → Pluit Selatan | Kali Besar → Bandengan → Penjaringan → Pluit

### 13 — CILEDUG - TEGAL MAMPANG

*Service pattern:* WD+WE, D 05.00-22.00, N 22.00-05.00
*Length:* 14.18 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/13-20250614.jpg

> Tegal Mampang → Rawa Barat → Pasar Santa → CSW → Mayestik → Velbak → Kebayoran Lama → Seskoal → Cipulir → Swadharma ParagonCorp → JORR → Petukangan D'MASIV → Puri Beta 1 → Puri Beta 2 → CBD Ciledug

### 14 — JAKARTA INTERNATIONAL STADIUM - SENEN

*Service pattern:* WD+WE, D+N 00.00-23.59
*Length:* 9.7 km
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/14-20260605.jpeg

> Jakarta International Stadium → Jembatan Item → Danau Sunter → Danau Agung → Landasan Pacu → JIExpo Kemayoran → Kemayoran → Tanah Tinggi → Senen TOYOTA Rangga → Senen Raya

### 2A — PULO GADUNG  - RAWA BUAYA

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/2A-20250422.jpg

> Pulo Gadung → Bermis → Pulo Mas → Perintis Kemerdekaan → Pedongkelan → Jempaka Mas → Sumur Batu → Cempaka Baru → Pasar Cempaka Putih → Rawa Selatan → Galur → Senen TOYOTA Rangga → Kwitang → Gambir 2 → Balai Kota → Petojo → Roxy → Grogol → Jelambar → Damai → Taman Kota → Jembatan Gantung → Pulo Nangka → Jembatan Baru → Rawa Buaya

### 3F — KALIDERES - SENAYAN BANK JAKARTA

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/3F-20250909.jpg

> Kalideres → Pesakih → Sumur Bor → Rawa Buaya → Jembatan Baru → Pulo Nangka → Jembatan Ganting → Taman Kota → Damai → Jelambar → Grogol Reformasi → Tanjung Duren → Kota Bambu → Kemanggisan → Petamburan → Gerbang Pemuda → Senayan Bank Jakarta

### 3H — DAMAI - KOTA

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/3H-20241212.jpg

> Damai → Jelambar → Grogol → Roxy → Petojo → Harmoni → Sawah Besar → Mangga Besar → Taman Sari → Glodok → Kali Besar → Museum Sejarah Jakarta → Kota

### 4D — PULO GADUNG  - KUNINGAN

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/4D-20260621.jpeg

> Pulo Gadung → Pasar Pulo Gadung → Pemuda Merdeka → Layur → Pemuda Rawamangun → Velodrome → Kayu Jati → Rawamangun → Simpang Pramuka 1/2 → Pramuka Sari → Utan Kayu → Pasar Genjing → Flyover Pramuka → Matraman → Tegalan → Kesatrian → Manggarai Temporer 1/2 → Pasar Rumput → Halimun → Setiabudi Integritas → Kuningan Madya → Karet Kuningan → Rasuna Said → Kuningan → Patra Kuningan

### 5C — CILILITAN  - JUANDA

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/5C-20251006.jpg

> Cililitan → Cawang Cililitan → Cawang Sentral → Cawang → Cawang Baru → Gelanggang Remaja → Bidara Cina → Kampung Melayu → Jatinegara → Bali Mester → Matraman Baru → Kesatrian → Tegalan → Matraman → Paseban → Salemba → Kramat Sentiong → Pal Putih → Kwitang → Balai Kota → Lapangan Banteng → Monumen Nasional → Pecenongan → Juanda

### 6A — RAGUNAN - BALAI KOTA VIA KUNINGAN

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/6A-20260621.jpeg

> Balai Kota → Kebon Sirih → M.H Thamrin → Bundaran HI ASTRA → Setiabudi Integritas → Kuningan Madya → Karet Kuningan → Rasuna Said → Kuningan → Patra Kuningan → Underpass Kuningan → Mampang Prapatan → Duren Tiga → Warung Buncit → Warung Jati → Buncit Indah → Pejaten → Jati Padang → Jati Barat → Simpang Ragunan Ar-Raudhah → Ragunan

### 6B — RAGUNAN - BALAI KOTA VIA SEMANGGI

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/6B-20241218.jpg

> Balai Kota → Kebon Sirih → M.H Thamrin → Bundaran HI ASTRA → Tosari → Dukuh Atas → Karet → Semanggi → Widya Chandra Telkomsel → Denpasar → Mampang Prapatan → Duren Tiga → Warung Buncit → Warung Jati → Buncit Indah → Pejaten → Jati Padang → Jati Barat → Simpang Ragunan Ar-Raudhah → Ragunan

### 6V — RAGUNAN - SENAYAN BANK JAKARTA

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/6V-20250909.jpg

> Ragunan → Simpang Ragunan Ar-Raudhah → Jati Barat → Jati Padang → Pejaten → Buncit Indah → Warung Jati → Warung Buncit → Duren Tiga → Mampang Prapatan → Tegal Mampang → Rawa Barat → Pasar Santa → ASEAN → Masjid Agung → Bundaran Senayan → Senayan Bank Jakarta

### 7F — KAMPUNG RAMBUTAN - JUANDA VIA CEMPAKA PUTIH

*Service pattern:* WD+WE, AM 05.00-09.00, PM 15.00-21.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/7F-20250422.jpg

> Juanda → Pecenongan → Monumen Nasional → Balai Kota → Pasar baru → Kwitang → Senen TOYOTA Rangga → Galur → Rawa Selatan → Pasar Cempaka Putih → Cempaka Baru → Sumur Batu → Cempaka Mas → Cempaka Putih → Pulomas Bypass → Kayu Putih Rawasari → Pemuda Pramuka → Utan Kayu Rawamangun → Pasar Induk → Trikora → Flyover Raya Bogor → Tanah Merdeka → Kampung Rambutan

### 9A — CILILITAN - GROGOL

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/9A-20241218.jpg

> Cililitan → Cawang Cililitan → Cawang → Ciliwung → Cikoko → Tebet Eco Park → Pancoran Tugu → Pancoran → Tegal Parang → Simpang Kuningan → Denpasar → Widya Chandra Telkomsel → Semanggi → Gerbang Pemuda → Petamburan → Kemanggisan → Kota Bambu → Tanjung Duren → Grogol Reformasi

### 9C — PINANG RANTI - BUNDARAN SENAYAN

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/9C-20250909.jpg

> Pinang Ranti → Makasar → Cawang Sentral → Cawang → Ciliwung → Cikoko → Tebet Eco Park → Pancoran Tugu → Pancoran → Tegal Parang → Simpang Kuningan → Denpasar → Widya Chandra Telkomsel → Semanggi → Senayan Bank Jakarta → Bundaran Senayan

### 9N — PINANG RANTI - SIMPANG CAWANG

*Service pattern:* WE only (weekend), D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/9N-20250312.jpg

> Pinang Ranti → Makasar → Cawang Sentral → Simpang Cawang

### 10H — TANJUNG PRIOK - BUNDARAN SENAYAN

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/10H-20250909.jpg

> Tanjung Priok → Pademangan → Gunung Sahari → Jembatan Merah → Pasar Baru Timur → Juanda → Pecenongan → Petojo → Tarakan → Tomang Raya → Kota Bambu → Kemanggisan → Petamburan → Gerbang Pemuda → Senayan Bank Jakarta → Bundaran Senayan

### 13B — PURI BETA - PANCORAN

*Service pattern:* WD+WE, D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/13B-20250303.jpg

> Puri Beta 2 → Puri Beta 1 → Petukangan D'MASIV → JORR → Swadharma ParagonCorp → Cipulir → Seskoal → Kebayoran Lama → Velbak → Mayestik → CSW → Pasar Santa → Rawa Barat → Tegal Mampang → Pancoran Arah Barat → Pancoran Arah Timur

### 13E — PURI BETA - FLYOVER KUNINGAN

*Service pattern:* WE only (weekend), D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/13E-20260621.jpeg

> Puri Beta 2 → Puri Beta 1 → Petukangan D'MASIV → JORR → Swadharma ParagonCorp → Cipulir → Seskoal → Kebayoran Lama → Velbak → Mayestik → CSW → Pasar Santa → Rawa Barat → Tegal Mampang → Simpang Kuningan → Underpass Kuningan → Patra Kuningan → Kuningan → Rasuna Said → Karet Kuningan → Kuningan Madya → Setiabudi Integritas → Flyover Kuningan

### L13E — PURI BETA - FLYOVER KUNINGAN (EXPRESS)

*Service pattern:* WD only (weekday), D 05.00-22.00
*Map:* https://smk.transjakarta.co.id/aset/berkas/rute/L13E-20260621.jpeg

> Puri Beta 2 → Puri Beta 1 → Petukangan D'MASIV → Velbak → CSW → Tegal Mampang → Simpang Kuningan → Underpass Kuningan → Patra Kuningan → Kuningan → Rasuna Said → Karet Kuningan → Kuningan Madya → Setiabudi Integritas → Flyover Kuningan

---

## 4. Mikrotrans — the small-bus feeder layer

Source: [transjakarta.co.id/layanan/mikrotrans](https://transjakarta.co.id/layanan/mikrotrans) · [id.wikipedia.org/wiki/Mikrotrans](https://id.wikipedia.org/wiki/Mikrotrans)

**What it is.** Mikrotrans is Transjakarta's small-bus feeder class: converted mikrolet/angkot vehicles (Suzuki Carry 1.5 Real Van, Daihatsu Gran Max, and air-conditioned variants) that penetrate residential neighbourhoods up to a few hundred metres beyond the nearest BRT/MRT/LRT station. Passengers wait at roadside "STOP, bus pengumpan Transjakarta" signboards rather than at platforms.

**History.** 3 April 2017 — PT Transportasi Jakarta partnered with **Koperasi Wahana Kalpika (KWK)** to run integrated neighbourhood services serving Transjakarta halte; the free-with-KUE window ended 31 December 2017. The scheme was folded into **OK OTrip**, which was renamed **JakLingko** on 8 October 2018. At that point the government explicitly confirmed the service name is **Mikrotrans** (to stop the public confusing the vehicle brand "Jak Lingko" with the service class).

**Operators (cooperatives / companies):**

* **KWK** — Koperasi Wahana Kendaraan Angkutan Lingkungan dan Pinggir Kota
* **PUS** — Pusat Koperasi Angkutan Udara Halim Perdanakusuma
* **Mikrolet / APB** (Angkutan Pengganti Bemo) group: PT Kencana Sakti Transport (KST), Koperasi Mikrolet Jakarta Raya (KMJ), Koperasi Angkutan Umum Budi Luhur (BDL), Koperasi Minibus Karya Jakarta Raya (KMK), Koperasi Angkutan Umum Kopamilet Jaya (KPM), Koperasi Angkutan Purimas Jaya (PRM), PT Lestari Surya Gema Persada (LSG), Koperasi Kojang Jaya (KJG), Koperasi Angkutan Layanan Masyarakat Jakarta Raya (KLM)

**Route coding.** Routes are `JAK.01` … `JAK.120`, with lettered variants where a route was split (`JAK.03`, `JAK.10A`, `JAK.10B`, `JAK.43B`, `JAK.43C`, `JAK.48A`, `JAK.78A`, `JAK.78B`, `JAK.98`, `JAK.105`–`JAK.108`, `JAK.110A`, `JAK.110B`, `JAK.112`, `JAK.113`, `JAK.115`, `JAK.117`, `JAK.118`, `JAK.120`). The route name is **origin – destination**, and the official site lists them alphabetically by the origin name. 99 routes are currently published.

| Route | Official name |
|---|---|
| JAK01 | TANJUNG PRIOK - PLUMPANG |
| JAK02 | KAMPUNG MELAYU - DUREN SAWIT |
| JAK03 | LEBAK BULUS - ANDARA |
| JAK04 | GROGOL - TUBAGUS ANGKE |
| JAK05 | SEMPER - ROROTAN |
| JAK06 | KAMPUNG RAMBUTAN - PONDOK GEDE |
| JAK07 | TANAH ABANG - GROGOL VIA TAWAKAL |
| JAK08 | TANAH ABANG - BENHIL VIA ROXY |
| JAK09 | TANAH ABANG - KARET VIA ROXY |
| JAK10 | TANAH ABANG - KOTA |
| JAK11 | TANAH ABANG - KEBAYORAN LAMA |
| JAK12 | TANAH ABANG - KEBAYORAN LAMA VIA POS PENGUMBEN |
| JAK13 | TANAH ABANG - JEMBATAN LIMA |
| JAK14 | TANAH ABANG - MERUYA |
| JAK15 | TANJUNG PRIOK - RUSUN MARUNDA |
| JAK16 | CILILITAN  - CONDET |
| JAK17 | SENEN - PULOGADUNG |
| JAK18 | STASIUN DUREN KALIBATA - KUNINGAN |
| JAK19 | PINANG RANTI - KAMPUNG RAMBUTAN |
| JAK20 | CAWANG UKI - LUBANG BUAYA |
| JAK21 | CILILITAN  - DWIKORA |
| JAK22 | DWIKORA - PENAS KALIMALANG |
| JAK23 | SENEN - PISANGAN BARU |
| JAK24 | SENEN - PULO GADUNG VIA KELAPA GADING |
| JAK25 | PASAR REBO - KALISARI |
| JAK26 | RAWAMANGUN - DUREN SAWIT |
| JAK27 | PULO GEBANG - ROROTAN |
| JAK28 | PASAR REBO-STASIUN LRT HARJAMUKTI |
| JAK29 | TANJUNG PRIOK - SUKAPURA |
| JAK30 | GROGOL - MERUYA VIA ROXY |
| JAK31 | BLOK M - ANDARA |
| JAK32 | LEBAK BULUS - JOGLO |
| JAK33 | PULO GADUNG - KOTA |
| JAK34 | TERMINAL KLENDER - TERMINAL RAWAMANGUN |
| JAK35 | RAWAMANGUN - PANGKALAN JATI |
| JAK36 | CILANGKAP  - CILILITAN ( PGC ) |
| JAK37 | CILILITAN ( PGC ) - CONDET VIA KAYU MANIS |
| JAK38 | BULAK RINGIN - KAMPUNG RAMBUTAN |
| JAK39 | KALIMALANG - DUREN SAWIT |
| JAK40 | HARAPAN BARU - PULO GEBANG VIA RAWA KUNING |
| JAK41 | KAMPUNG MELAYU - PULO GADUNG |
| JAK42 | KAMPUNG MELAYU - PONDOK KELAPA |
| JAK44 | ANDARA - STASIUN UNIVERSITAS PANCASILA |
| JAK45 | LEBAK BULUS - RAGUNAN |
| JAK46 | JAGAKARSA - PASAR MINGGU |
| JAK47 | PASAR MINGGU - CIGANJUR VIA KEBUN BINATANG RAGUNAN |
| JAK49 | LEBAK BULUS - CIPULIR |
| JAK50 | KALIDERES - PURI KEMBANGAN |
| JAK51 | TAMAN KOTA - BUDI LUHUR |
| JAK52 | KALIDERES - MUARA ANGKE |
| JAK53 | GROGOL - POS PENGUMBEN |
| JAK54 | GROGOL - BENHIL |
| JAK56 | PESING - SRENGSENG |
| JAK58 | CILINCING - RUSUN PADAT KARYA |
| JAK59 | RAWAMANGUN - RAWA SENGON |
| JAK60 | KELAPA GADING - RUSUN KEMAYORAN |
| JAK61 | CEMPAKA PUTIH-PULO GADUNG VIA KELAPA GADING |
| JAK64 | ASELI - TERMINAL PASAR MINGGU |
| JAK71 | KAMPUNG RAMBUTAN - PINANG RANTI |
| JAK72 | KAMPUNG RAMBUTAN - PASAR REBO VIA PONCOL |
| JAK73 | JAMBORE CIBUBUR - PASAR REBO |
| JAK74 | RAWAMANGUN - CIPINANG MUARA |
| JAK75 | CILILITAN - KAMPUNG PULO |
| JAK76 | JALAN INDUSTRI RAYA - ASMI |
| JAK77 | TANJUNG PRIOK - JEMBATAN HITAM |
| JAK79 | CENGKARENG - TUBAGUS ANGKE |
| JAK80 | RAWA BUAYA - RAWA KOMPENI |
| JAK84 | TERMINAL KAMPUNG MELAYU - KAPIN RAYA |
| JAK85 | BINTARA - CIPINANG INDAH |
| JAK86 | TERMINAL RAWAMANGUN - TERMINAL MANGGARAI |
| JAK87 | TERMINAL TANJUNG PRIOK - TERMINAL RAWAMANGUN |
| JAK88 | TERMINAL TANJUNG PRIOK - ANCOL BARAT |
| JAK89 | TERMINAL TANJUNG PRIOK - TAMAN KOTA INTAN |
| JAK90 | TERMINAL TANJUNG PRIOK - RUSUN KEMAYORAN |
| JAK93 | JERUK PURUT - KEBAYORAN LAMA |
| JAK95 | TERMINAL LEBAK BULUS - TERMINAL PASAR MINGGU |
| JAK98 | TERMINAL KAMPUNG RAMBUTAN - MUNJUL |
| JAK99 | TERMINAL PULO GADUNG - LAMPIRI |
| JAK100 | TERMINAL PULO GEBANG - RUSUN PINUS ELOK |
| JAK102 | BLOK M - LEBAK BULUS |
| JAK105 | STASIUN TEBET - RUSUN CIPINANG MUARA |
| JAK106 | TERMINAL KLENDER - TERMINAL KAMPUNG MELAYU |
| JAK107 | JEMBATAN GARDEN - PURI BETA |
| JAK108 | KRAMAT JATI - BAMBU APUS |
| JAK10A | GONDANGDIA - CIKINI VIA SALEMBA RAYA |
| JAK10B | GONDANGDIA - CIKINI VIA KRAMAT RAYA |
| JAK112 | TERMINAL TANAH MERAH - PULO GADUNG |
| JAK113 | TANAH MERDEKA - KAMPUNG SAWAH |
| JAK115 | TERMINAL TANJUNG PRIOK - PEGANGSAAN II IGI |
| JAK117 | TANJUNG PRIOK - TANAH MERDEKA |
| JAK118 | TAMAN WADUK PAPANGGO - KOTA TUA |
| JAK120 | JAKARTA INTERNATIONAL STADIUM-TERMINAL MUARA ANGKE |
| JAK43B | TONGTEK - TEBET ECO PARK - CILILITAN |
| JAK43C | SARANA JAYA - TEBET ECO PARK - STASIUN CAWANG |
| JAK48A | STASIUN TEBET - KARET |
| JAK78A | BENDA - CENGKARENG |
| JAK78B | JEMBATAN TIGA -TELUK GONG |
| JAK110A | RUSUN MARUNDA - PULO GEBANG |
| JAK110B | RUSUN KOMARUDIN - PUTARAN BALIK BEBEK TNI |

**Stop naming.** Mikrotrans stops are named after the street or landmark, with Indonesian abbreviations: `Jl.` (Jalan), `Gg.` (Gang), `Kp.` (Kampung), `Ps.` (Pasar), `St.` (Stasiun), `Sbr.` (Sebelah — "next to"), `SMAN/SMPN/SMK` (secondary schools). Example — **JAK.44 Andara – Stasiun Universitas Pancasila**: Andara Margasawa 1/2/3/4, Semar, Jl. Damal Musyawarah, Jl. Pringgondani, Puri Margasawa, Sbr. Komplek Bukit Indah Ragunan, Simpang Kampung Kandang 1/2, Jl. M. Khafi, Gg. Harapan I Jagakarsa, Pemadam Jagakarsa, Sekolah Gita Buena, Sbr. TK Rahmania Ragunan, Gg. Musholla II, Simpang Sagu Pepaya Raya, Jl. Pepaya V Jagakarsa, Jl. Pepaya Raya, Jl. Pepaya Raya 2, SMPN 166, SMAN 49, Yayasan Al Azhar Syuhada, Masjid Jami Al Wiqayah, Gp. H. Bontong, SPBU Jagakarsa, Sbr. Sekolah Islam Al Azhar Jagakarsa, Sbr. STIKES Bhakti Pertiwi Jagakarsa, Sbr. Gg. Robaya, Sbr. RS Aulia, Sekolah Avicenna Jagakarsa, Ibik 57, Sbr. SDN Srengseng Sawah 01, St. Lenteng Agung 2, Gg. H. Tohir, Gg. H. Ali, Kampus IISIP, Jl. H. Zakaria, Gg. Raidi, St. Lenteng Agung 1, Wijaya Kusuma, Jl. Raya Lenteng Agung, Gg. Sawo Jagakarsa, Gg. Durian — terminus *St. Univ. Pancasila Jak Lingko*.

---

## 5. MiniTrans — the medium-bus feeder layer

MiniTrans is the **medium-bus (bus sedang)** tier of the non-BRT feeder fleet, sandwiched between the large MetroTrans buses and the small Mikrotrans minibuses.

**Vehicle/operator split of the non-BRT feeder fleet** (id.wikipedia.org/wiki/Transjakarta, "Pengumpan dalam kota"):

| Tier | Vehicle | Operators |
|---|---|---|
| **MetroTrans** (bus besar) | Mercedes-Benz OH 1626, OH 1526; Scania K250UB Low Entry; Mercedes O 500 U 1726; electric: SAG Golden Dragon Pivot E12, Skywell NJL6129BEV, BYD B12 | Mayasari Bakti, PT Transportasi Jakarta (swakelola), Bianglala Metropolitan, Perum DAMRI |
| **MiniTrans** (bus sedang) | Mitsubishi Colt FE 84G, Hino FB 130 | Trans Swadaya, Jewa Dian Mitra, Bayu Holong Persada, Pusaka Satria Utama (Bluebird), Sentra Glosia Indonesia |
| **Mikrotrans** (bus kecil) | Suzuki Carry 1.5 Real Van, Daihatsu Gran Max | KWK, PUS and the Mikrolet/APB cooperative group |

**Route attribution.** The MiniTrans fleet is *not* given its own route-number series on the official site — those routes appear under **Angkutan Pengumpan**. Which routes are MiniTrans is inferred from operator attribution: routes run by **Jewa Dian Mitra (JDM)**, **Bayu Holong Persada (BHL/MBT)**, **Pusaka Satria Utama / Bluebird (PSU)** and **Sentra Glosia Indonesia (SGI)** are the medium-bus routes (Bayu Holong's fleet prefix `MBT` is itself a mnemonic for *MiniTrans*). Routes with operator prefix `TSW` are Trans Swadaya's Mitsubishi Colt FE 84G MiniTrans buses (e.g. `TSW-024`).

The routes attributed to MiniTrans operators are:

| Route | Name | Operator(s) per Wikipedia attribution |
|---|---|---|
| 1A | PANTAI MAJU - BALAI KOTA | Perum DAMRI, Mayasari Bakti, PT Transportasi Jakarta (swakelola) |
| 1B | STASIUN PALMERAH - TRANSPORT HUB DUKUH ATAS | Mayasari Bakti |
| 1E | PONDOK LABU - BLOK M | Mayasari Bakti |
| 1F | STASIUN PALMERAH - BUNDARAN SENAYAN | Mayasari Bakti |
| 1H | TANAH ABANG - STASIUN GONDANGDIA | PT Transportasi Jakarta (swakelola) |
| 1M | MERUYA - BLOK M | Jewa Dian Mitra |
| 1P | SENEN - BLOK M | PT Transportasi Jakarta (swakelola), Perum DAMRI |
| 1Q | REMPOA - BLOK M | Jewa Dian Mitra, KBM |
| 1R | SENEN - TANAH ABANG | PT Transportasi Jakarta (swakelola) |
| 2B | HARAPAN INDAH - PULO GADUNG | Perum DAMRI |
| 2P | STASIUN GONDANGDIA - PASAR SENEN | PT Transportasi Jakarta (swakelola) |
| 2Q | GONDANGDIA - BALAIKOTA | PT Transportasi Jakarta (swakelola) |
| 3D | TAMAN KOTA - PENJARINGAN VIA TUBAGUS ANGKE | PT Transportasi Jakarta (swakelola) |
| 3E | SENTRALAND CENGKARENG - PURI KEMBANGAN | PT Transportasi Jakarta (swakelola) |
| 4B | STASIUN MANGGARAI - UNIVERSITAS INDONESIA | Mayasari Bakti |
| 4C | JIEP - BUNDARAN SENAYAN | Perum DAMRI, PT Transportasi Jakarta (swakelola) |
| 4F | PINANG RANTI - PULO GADUNG | PT Transportasi Jakarta (swakelola) |
| 4K | PULO GADUNG - KEJAKSAAN AGUNG | Perum DAMRI |
| 5B | STASIUN TEBET - BIDARA CINA | Jewa Dian Mitra |
| 5F | KAMPUNG MELAYU - TANAH ABANG | Mayasari Bakti, PT Transportasi Jakarta (swakelola) |
| 5M | KAMPUNG MELAYU - TANAH ABANG | Mayasari Bakti, PT Transportasi Jakarta (swakelola) |
| 5N | RAGUNAN- KAMPUNG MELAYU | Jewa Dian Mitra |
| 6C | STASIUN TEBET - KUNINGAN | Jewa Dian Mitra |
| 6D | STASIUN TEBET - BUNDARAN SENAYAN | Jewa Dian Mitra |
| 6K | KUNINGAN - KARET | Perum DAMRI |
| 6M | STASIUN MANGGARAI - BLOK M | Perum DAMRI |
| 6N | RAGUNAN - BLOK M VIA KEMANG | Jewa Dian Mitra |
| 6Q | DUKUH ATAS - CASABLANCA VIA EPICENTRUM | Mayasari Bakti |
| 6T | PASAR MINGGU - VELBAK VIA KEBON JERUK | Jewa Dian Mitra |
| 6U | BLOK M - PASAR MINGGU | Bayu Holong Persada (MBT) |
| 6W | DUREN TIGA - BLOK M VIA BANGKA RAYA | PT Transportasi Jakarta (swakelola) |
| 7A | KAMPUNG RAMBUTAN - LEBAK BULUS | Mayasari Bakti |
| 7B | KAMPUNG RAMBUTAN - BLOK M | Jewa Dian Mitra, Pusaka Satria Utama (Bluebird), Sentra Glosia Indonesia |
| 7C | CIBUBUR - CAWANG CILILITAN | Bayu Holong Persada (MBT) |
| 7D | TMII - PANCORAN | Perum DAMRI |
| 7E | KAMPUNG RAMBUTAN - RAGUNAN | Bayu Holong Persada (MBT) |
| 7P | PONDOK KELAPA - CAWANG CILILITAN | Pusaka Satria Utama (Bluebird) |
| 7Q | BLOK M - CAWANG CILILITAN | Jewa Dian Mitra |
| 7R | CIBUBUR - PLUIT | Bayu Holong Persada (MBT) |
| 7T | CIBUBUR - TANJUNG PRIOK | Perum DAMRI |
| 7U | CIBUBUR - ANCOL | Perum DAMRI |
| 7V | CIBUBUR - KAMPUNG RAMBUTAN | Bayu Holong Persada (MBT) |
| 7W | CAWANG - STASIUN KERETA CEPAT HALIM | PT Transportasi Jakarta (swakelola) |
| 8C | KEBAYORAN LAMA - TANAH ABANG | Sentra Glosia Indonesia |
| 8D | MERUYA SELATAN - BLOK M | Jewa Dian Mitra, KBM |
| 8E | BINTARO - BLOK M | Jewa Dian Mitra, KBM |
| 8K | BATUSARI - GROGOL | PT Transportasi Jakarta (swakelola) |
| 8M | TANAH ABANG - TANJUNG DUREN | PT Transportasi Jakarta (swakelola) |
| 8N | KEBAYORAN - PETAMBURAN VIA ASIA AFRIKA | Pusaka Satria Utama (Bluebird) |
| 9D | PASAR MINGGU - TANAH ABANG | Jewa Dian Mitra |
| 9E | KEBAYORAN - JELAMBAR | Perum DAMRI |
| 9H | PASAR MINGGU - CIPEDAK | Sentra Glosia Indonesia |
| 11D | PULO GEBANG - PULO GADUNG VIA PIK | Perum DAMRI |
| 11Q | KAMPUNG MELAYU - PULO GEBANG VIA BKT | Perum DAMRI |
| 11W | STASIUN KLENDER - PULO GADUNG | Perum DAMRI |
| 12B | PLUIT - SENEN | Mayasari Bakti |
| 12P | STASIUN LRT PEGANGSAAN - JIS | Mayasari Bakti |
| 14A | MONUMEN NASIONAL - JAKARTA INTERNATIONAL STADIUM | Perum DAMRI |
| 14B | TANJUNG PRIOK - SENEN VIA JIS | PT Transportasi Jakarta (swakelola) |

**Boarding rules.** Non-BRT → BRT transfers are only possible at halte designated for that route. For **MetroTrans** specifically, transfers are only possible at designated terminus / end-of-route halte. MetroTrans and MiniTrans buses do **not** have the women-only front section that the blue BRT buses have.

---

## 6. Angkutan Pengumpan — the non-BRT city bus routes

Source: [transjakarta.co.id/layanan/angkutan-pengumpan](https://transjakarta.co.id/layanan/angkutan-pengumpan) · [id.wikipedia.org/wiki/Layanan_pengumpan_dalam_kota_(Transjakarta)](https://id.wikipedia.org/wiki/Layanan_pengumpan_dalam_kota_(Transjakarta))

These are the **regular, non-BRT, non-Mikrotrans city bus routes**. The official site describes them as:

> "Layanan angkutan umum yang melayani titik perhentian di luar jaringan jalur BRT Transjakarta."

**Route coding.** The prefix digit is the **BRT corridor the route supports**, and the suffix letter is the sequence number of the route created against that corridor — hence `1A`, `1B`, `1C`… `14B`. This is why the Wikipedia article calls them "rute-rute yang kebanyakan memakai rute-rute bekas bus kota, seperti Kopaja dan Metromini" — the corridors were originally numbered by the *kopaja* (city bus) companies they absorbed. Some routes do not follow the pattern and are named for their function or terminal, e.g. `51ST` (*Shuttle* HBKB Ancol), `12P` (*Stasiun LRT Pegangsaan – JIS*), `1F` (*Stasiun Palmerah – Bundaran Senayan*), `6Q` (*Dukuh Atas – Casablanca via Epicentrum*), `9H` (*Pasar Minggu – Cipedak*), `7W` (*Cawang – Stasiun Kereta Cepat Halim*).

Some routes carry a `ST` suffix meaning **suttle/shuttle** (e.g. `51ST` Shuttle HBKB Ancol, launched 9 August 2026, Bundaran Senayan ↔ Bundaran Symphony of The Sea, running only on car-free days (HBKB) 06:00–10:00 and free of charge).

| Route | Official name |
|---|---|
| 1A | PANTAI MAJU - BALAI KOTA |
| 1B | STASIUN PALMERAH - TRANSPORT HUB DUKUH ATAS |
| 1C | PESANGGRAHAN - BLOK M |
| 1E | PONDOK LABU - BLOK M |
| 1F | STASIUN PALMERAH - BUNDARAN SENAYAN |
| 1H | TANAH ABANG - STASIUN GONDANGDIA |
| 1M | MERUYA - BLOK M |
| 1P | SENEN - BLOK M |
| 1Q | REMPOA - BLOK M |
| 1R | SENEN - TANAH ABANG |
| 1W | BLOK M - ANCOL |
| 2B | HARAPAN INDAH - PULO GADUNG |
| 2P | STASIUN GONDANGDIA - PASAR SENEN |
| 2Q | GONDANGDIA - BALAIKOTA |
| 3D | TAMAN KOTA - PENJARINGAN VIA TUBAGUS ANGKE |
| 3E | SENTRALAND CENGKARENG - PURI KEMBANGAN |
| 4B | STASIUN MANGGARAI - UNIVERSITAS INDONESIA |
| 4C | JIEP - BUNDARAN SENAYAN |
| 4F | PINANG RANTI - PULO GADUNG |
| 4K | PULO GADUNG - KEJAKSAAN AGUNG |
| 5B | STASIUN TEBET - BIDARA CINA |
| 5F | KAMPUNG MELAYU - TANAH ABANG |
| 5M | KAMPUNG MELAYU - TANAH ABANG |
| 5N | RAGUNAN- KAMPUNG MELAYU |
| 6C | STASIUN TEBET - KUNINGAN |
| 6D | STASIUN TEBET - BUNDARAN SENAYAN |
| 6H | SENEN - LEBAK BULUS |
| 6K | KUNINGAN - KARET |
| 6M | STASIUN MANGGARAI - BLOK M |
| 6N | RAGUNAN - BLOK M VIA KEMANG |
| 6Q | DUKUH ATAS - CASABLANCA VIA EPICENTRUM |
| 6T | PASAR MINGGU - VELBAK VIA KEBON JERUK |
| 6U | BLOK M - PASAR MINGGU |
| 6W | DUREN TIGA - BLOK M VIA BANGKA RAYA |
| 7A | KAMPUNG RAMBUTAN - LEBAK BULUS |
| 7B | KAMPUNG RAMBUTAN - BLOK M |
| 7C | CIBUBUR - CAWANG CILILITAN |
| 7D | TMII - PANCORAN |
| 7E | KAMPUNG RAMBUTAN - RAGUNAN |
| 7P | PONDOK KELAPA - CAWANG CILILITAN |
| 7Q | BLOK M - CAWANG CILILITAN |
| 7R | CIBUBUR - PLUIT |
| 7T | CIBUBUR - TANJUNG PRIOK |
| 7U | CIBUBUR - ANCOL |
| 7V | CIBUBUR - KAMPUNG RAMBUTAN |
| 7W | CAWANG - STASIUN KERETA CEPAT HALIM |
| 8C | KEBAYORAN LAMA - TANAH ABANG |
| 8D | MERUYA SELATAN - BLOK M |
| 8E | BINTARO - BLOK M |
| 8K | BATUSARI - GROGOL |
| 8M | TANAH ABANG - TANJUNG DUREN |
| 8N | KEBAYORAN - PETAMBURAN VIA ASIA AFRIKA |
| 9D | PASAR MINGGU - TANAH ABANG |
| 9E | KEBAYORAN - JELAMBAR |
| 9H | PASAR MINGGU - CIPEDAK |
| 11D | PULO GEBANG - PULO GADUNG VIA PIK |
| 11Q | KAMPUNG MELAYU - PULO GEBANG VIA BKT |
| 11W | STASIUN KLENDER - PULO GADUNG |
| 12A | KOTA - KALIADEM |
| 12B | PLUIT - SENEN |
| 12P | STASIUN LRT PEGANGSAAN - JIS |
| 14A | MONUMEN NASIONAL - JAKARTA INTERNATIONAL STADIUM |
| 14B | TANJUNG PRIOK - SENEN VIA JIS |
| 51ST | SHUTTLE HBKB ANCOL |

**Example route anatomy — `1A` Pantai Maju – Balai Kota** (official map, dated 31 August 2026): the route runs through the BRT halte *Balai Kota*, *Monumen Nasional*, *Harmoni*, *Sawah Besar*, *Mangga Besar*, *Taman Sari*, *Glodok*, *Kota* (MRTs), *Museum Sejarah Jakarta*, *BRI Jakarta Kota*, *Gedong Panjang*, *Pakin*, *Masjid Luar Batang*, *SDN Penjaringan 3*, *Pluit Selatan*, *Aston Pluit 1*, *Pluit Sakti*, *SMKN 56*, *Waduk Pluit*, *Stella Maris 1*, *SD Diakonia 1*, *Baywalk 2*, *Baywalk 1*, *Polisi Militer Pluit*, *Muara Angke*, *Karang Asri*, *SMAK Penabur Enam 1*, *Karang Asri 2*, *Galeri Niaga Mediterania 2*, *Margasatwa 1*, *Mediterania Boulevard*, *Mandara Permai 5*, *Mandara Permai 6*, *Simpang Mandara Permai 1*, *RS PIK*, *Waterboom Jakarta 1*, *Ruko Cordoba 1*, *PIK Avenue*, *Fresh Market PIK*, *The Piano*, *Seberang Food Street*, *Melody Golf 2*, *The Violin* — terminus *Pantai Maju*; the return leg uses *Kali Besar, Jl. Tiang Bendera III, Bandengan, Jembatan Tiga 2, Penjaringan, Jl. BB Utara, Sbr. Waduk Pluit*, *Stella Maris 2, SD Diakonia 2, Sbr. PLTU Pluit, PLTU, Pluit 1, SPBG Jakpro, Pluit Karang Indah*, *Jl. Pluit Karang Indah XV, Muara Karang Raya, Ps. Muara Karang, SMAK Penabur Enam 2*, *Galeri Niaga Mediterania 1, Margasatwa 2, Jl. Lotus Indah, Centro Metro Broadway, Mayang Permai*, *Simpang Mandara Permai 2, Metric PIK, RS PIK 2, Waterboom Jakarta 2, Ruko Cordoba 2, Ruko Cordoba 3*, *Buddha Tzu Chi, Gold Coast, Food Street, Melody Golf*. Note the **SPBG Jakpro** stop — an internal Transjakarta/Jakpro facility stop.

**Feeder route hierarchy in Transjakarta** (from Wikipedia *Transjakarta* → "Operator koridor dan armada bus"):

* *Non-BRT Terintegrasi BRT* — the route can transfer to BRT at a shared halte.
* *Non-BRT Tidak Terintegrasi BRT* — no shared paid-area transfer; passengers transfer at ground level.
* *Rumah Susun* — free shuttles for apartment (rusunawa) residents.
* *Rute Pengumpan Menuju Jakarta International Expo* — event feeders.

---

## 7. Other service classes (for completeness)

These appear on the official site or in Wikipedia but are not among the four requested classes.

* **RoyalTrans** — premium bus service launched 12 March 2018 by BPTJ + PT Transportasi Jakarta, part of the TransJabodetabek Premium programme for the Jakarta–Cikampek toll road. Now under the Directorate General of Integrated Transport (DitjenIntegrasi). Fares are market-based, not the Rp2,000/Rp3,500 subsidy fare.
* **TransJabodetabek** — cross-province routes administered with BPTJ: `B11 B13 B21 BW4 D11 D21 M3 M4 M5 M8 M14 S11 S12 S21 S22 SH1 …` (S = Schwerin? no: B/D/S/T/P prefixes = Samsungun/Sumedang/Pondokgede/Tangerang/Bekasi directional families, `SH` = shuttle). Wikipedia also lists B25, B41, B51, D41, P11, S61, SH1, SH2, T11, T12, T31.
* **Transjakarta Cares** — dedicated accessible services for people with disabilities, to disability-friendly halte.
* **Wisata** — tourist buses; *Open Top Tour* charges Rp100,000 (Rp75,000 promotional), and *Open Dining of Jakarta* is a dining bus.
* **Amari / Andini** — night (22:00–05:00) and early-morning services. Per Wikipedia, from **1 January 2025 all Amari/Andini night services were merged into and unified with the regular corridors** — consistent with the official maps now showing `N` badges on corridors 1–12 and 14.
* **Transbandara** — airport/regency inter-city service; Blok M–Soetta fare rose to Rp15,000 on 1 September 2026.

---

## 8. The official Transjakarta API — what actually works

### 8.1 `api.transjakarta.co.id` — UNREACHABLE at time of testing

```
$ nslookup api.transjakarta.co.id
Name: api.transjakarta.co.id
Address: 103.145.125.20

$ curl -sv https://api.transjakarta.co.id/v3/bus
* Host api.transjakarta.co.id:443 was resolved.
* IPv4: 103.145.125.20
* Trying 103.145.125.20:443... connect to 103.145.125.20 port 443 failed: Connection refused
```

| URL | Result |
|---|---|
| `https://api.transjakarta.co.id/v3/bus` | HTTP 000 — connection refused |
| `https://api.transjakarta.co.id/v3/routes` | HTTP 000 — connection refused |
| `https://api.transjakarta.co.id/v3/stops` | HTTP 000 — connection refused |
| `https://api.transjakarta.co.id/v3/health` | HTTP 000 — connection refused |
| `https://api.transjakarta.co.id/v2/bus` | HTTP 000 — connection refused |
| `http://api.transjakarta.co.id/v3/bus` | HTTP 000 — connection refused |
| `https://api.transjakarta.co.id:8080/v3/bus` | HTTP 000 — connection refused |
| `https://transjakarta.co.id/api/v3/bus` | HTTP 302 (redirect off-site) |
| `https://info.transjakarta.co.id/` | HTTP 000 — connection refused |

TCP port scan of 103.145.125.20: ports 80, 443, 8080 and 3000 are all **closed**. Both `curl` and an independent HTTP fetch tool failed identically, so this is a server-side outage or an egress block — **not** a client problem. **No response shape could be captured, and none is asserted here.** The commonly cited `/v3/bus`, `/v3/routes`, `/v3/stops` paths and a `Authorization` bearer/API-key scheme are documented in third-party projects but could NOT be verified here. Treat the endpoint list as *unverified* and re-test before relying on it.

### 8.2 `gtfs.transjakarta.co.id` — a CMS, not a public feed

```
$ curl -sI https://gtfs.transjakarta.co.id/
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8

<title>Login | Upload File GTFS</title>
```

| URL | Result |
|---|---|
| `https://gtfs.transjakarta.co.id/` | HTTP 200 — login page titled *"Login \| Upload File GTFS"* |
| `https://gtfs.transjakarta.co.id/gtfs.zip` | HTTP 404 |
| `https://gtfs.transjakarta.co.id/transjakarta.zip` | HTTP 404 |
| `https://gtfs.transjakarta.co.id/api` | HTTP 404 |
| `https://gtfs.feed.transjakarta.co.id/` | HTTP 000 — connection refused |

The page is the **Sistem Manajemen Konten (SMK)** CMS with `NIK` + `password` fields — an internal tool for staff to upload GTFS bundles, not a public data endpoint. **No public GTFS feed was found.**

### 8.3 Other official hosts that respond

| URL | Result |
|---|---|
| `https://transjakarta.co.id/` | HTTP 200 — main site |
| `https://transjakarta.co.id/layanan/brt` | HTTP 200 — BRT route list + official route maps |
| `https://transjakarta.co.id/layanan/mikrotrans` | HTTP 200 — Mikrotrans route list + maps |
| `https://transjakarta.co.id/layanan/angkutan-pengumpan` | HTTP 200 — non-BRT route list + maps |
| `https://transjakarta.co.id/layanan` | HTTP 200 — service-class index (BRT, Angkutan Pengumpan, Mikrotrans, Royaltrans, Transjakarta Cares, Wisata) |
| `https://transjakarta.co.id/rute` | HTTP 200 — full route index + *Peta Integrasi* link |
| `https://smk.transjakarta.co.id/aset/berkas/rute/<CODE>-<YYYYMMDD>.<jpg\|jpeg>` | HTTP 200 — official route map images (193 downloaded) |
| `https://ppid.transjakarta.co.id/` | HTTP 200 — PPID (public information disclosure) portal |

---

## 9. Halte naming conventions

### 9.1 BRT halte

* A BRT stop is called a **halte**; the physical structure is a **halte BRT** with a paid area, tap-in gates, platforms and usually a pedestrian bridge over the busway.
* The official maps distinguish five stop types: *Stasiun MRT*, *Stasiun LRT*, *Stasiun KCI*, *Terminal Bus*, *Halte BRT* and *Halte Non-BRT & Bus Stop*.
* **Directional naming.** Transjakarta does **not** use the "A" / "B" directional suffix (unlike KAI Commuterline). A halte is one physical place serving both directions; direction is conveyed by the route's terminal name and by arrow signs. Where a route is one-way on a segment, the map legend says **"Hanya Berhenti Sesuai Arah"** (only stops as per the direction) and **"Mengarah Sesuai Panah"** (go in line with the arrow).
* **Loop / paired stops.** Some corridors have a one-way loop through downtown. Examples: corridor 2 loops *Monumen Nasional → Pecenongan → Juanda → Istiqlal → Gambir → Pejambon → RSPAD → Senen Raya* and back via *Balai Kota → Gambir 2 → Kwitang*; corridor 12 loops *Kota → Museum Sejarah Jakarta → Gedong Panjang → Pakin → Pluit Selatan* and back via *Kali Besar → Bandengan → Penjaringan*. The Wikipedia *Halte transit* table records these as **paired transit halte** sharing one paid area, with passengers walking the connecting bridge.
* **Naming-rights neutralisation (December 2023).** PT Transportasi Jakarta stripped corporate, institutional and personal names from halte in order to sell naming rights: *Halte Indosiar* → *Halte Damai*, *Halte RS Sumber Waras* → *Halte Roxy*. This is why many halte now carry street/area names (Senayan Bank Jakarta, Rasuna Said, Pemuda Pramuka, Utan Kayu Rawamangun, Kayu Putih Rawasari).
* Some names are **commercial**: *Bundaran HI ASTRA*, *Senayan Bank Jakarta*, *Kuningan Madya* / *Patra Kuningan*, *Karet Kuningan*, *Setiabudi Integritas*, *Senen TOYOTA Rangga*, *Swadharma ParagonCorp*, *Polda Metro Jaya*, *M.H. Thamrin*, *Kebon Sirih*, *Ahimad*/*Jembatan Item*.

### 9.2 Non-BRT and Mikrotrans stop names

Non-BRT stops are named after the street, landmark or institution they sit beside, with the abbreviations listed in §4. Direction on feeder routes is again indicated by arrows and by the terminal name, not by a directional suffix. The official maps mark *Perhentian Sementara* (temporary stop), *Halte Dalam Perobaoan* (stop under construction) and *Halte Non-BRT & Bus Stop* (a plain roadside board).

---

## 10. Interchanges — BRT with MRT / LRT / KRL / Jabodebek

### 10.1 Key interchanges

| Hub | Modes | Notes |
|---|---|---|
| **Kota** | Transjakarta 1, 3, 3H, 12 · **MRT Jakarta** (Stasiun Kota, North-South line) | MRT Farewell (now *Kota*) station; Transjakarta 1 and 3H terminate here |
| **Bundaran HI / Grand Indonesia** | Transjakarta 1, 6A, 6B · **LRT Jakarta** (Bundaran HI) | Named *Bundaran HI ASTRA* on the official map; also the northern terminus of LRT Jakarta |
| **ASEAN** | Transjakarta 1, 6V · **LRT Jakarta** (ASEAN) | LRT Jakarta southern terminus |
| **Blok M** | Transjakarta 1, 1C, 1E, 1M, 1P, 1Q, 1W, 6U, 6N · **LRT Jakarta** (Blok M) · **MRT Jakarta** (Senayan Mastercard, walking distance) | Southern terminus of Transjakarta 1 |
| **Bundaran Senayan / Senayan Bank Jakarta** | Transjakarta 1, 3F, 6V, 9C, 10H · **MRT Jakarta** (Senayan Mastercard) · **LRT Jakarta** (Bundaran Senayan) | Transjakarta 3F and 6V terminate at the *Senayan Bank Jakarta* halte |
| **Harmoni** | Transjakarta 1, 3H | Elevated halte over the Ciliwung; historically the interchange with the pre-MRT busway hub |
| **Monumen Nasional** | Transjakarta 1, 2, 3, 7F | Downtown interchange; Transjakarta 2 and 7F loop here |
| **Senen TOYOTA Rangga / Senen Raya** | Transjakarta 2, 5C, 7F, 14 | Adjacent to **KRL Commuterline** Terminus Senen and the new **LRT Jakarta** Senen station (under construction on the north–south alignment) |
| **Cawang** | Transjakarta 7, 9, 9A, 9C, 9N, 10 · **LRT Jakarta** (Cawang) | Major south–east hub |
| **Cawang Cililitan / Cawang Sentral** | Transjakarta 5C, 7, 9, 9N, 10 | Junction complex on Jl. Gatot Subroto |
| **Cililitan** | Transjakarta 5C, 7, 9A | West end of the Cawang corridor |
| **Jatinegara** | Transjakarta 5, 5C, 7, 11 · **KRL Commuterline** (Stasiun Jatinegara) | Eastern terminus of Transjakarta 5 and 7 |
| **Stasiun Klender** | Transjakarta 11 · **KRL Commuterline** | Eastern end of Transjakarta 11 |
| **Tanjung Priok** | Transjakarta 10, 10H, 12 · **KRL Commuterline** (Stasiun Tanjung Priok) · bus terminal | Northern terminus of 10/10H/12 |
| **Galunggung** | Transjakarta 4, 4D, 6 · **LRT Jakarta** (Galunggung) | Southern terminus of Transjakarta 4 and 6 |
| **Kuningan** | Transjakarta 4D, 6, 6A, 6V | LRT Jakarta Kuningan station |
| **Lebak Bulus** | Transjakarta 8, 7A · **LRT Jakarta** (Lebak Bulus) | Southern terminus of Transjakarta 8 |
| **Jatinegara / Mount of Olives (Senen)** | — | See Senen above |
| **Pasar Minggu** | Mikrotrans JAK46, JAK64, JAK95; Angkutan Pengumpan 6U, 6T, 9D, 9H | Feeder hub; near the planned **LRT Jakarta / MRT Jakarta** south extension and the new LRT Jabodebek terminus |
| **Pasar Rebo** | Mikrotrans JAK25, JAK28, JAK73 | Feeder hub |
| **Puri Beta 1 / Puri Beta 2** | Transjakarta 13, 13B, 13E, L13E | Western terminus of the newest corridors |
| **Cibubur** | Angkutan Pengumpan 7C, 7R, 7T, 7U, 7V | Feeder hub at the MRT/LRT interchange with **LRT Jabodebek** (Cibubur station) |
| **Bekasi / Cawang** | LRT Jabodebek | LRT Jabodebek links Cibubur–Cawang–Pulogadung–Bekasi; through-ticketing with Transjakarta exists |

### 10.2 Halte transit (paid-area interchange between corridors)

From the Wikipedia *Halte transit* table — these are the halte where two corridors share one paid area:

| Halte | Corridors |
|---|---|
| ASEAN | 1, 12 |
| menempuh Kejaksaan Agung / Masjid Agung | 1 |
| CSW | 1, 13 |
| Bendungan Hilir / Semanggi | 1, 9 |
| Dukuh Atas | 1 |
| Galunggung | 1, 4, 6 |
| Monumen Nasional | 1, 2, 3 |
| Kali Besar / Museum Sejarah Jakarta / Kota | 1, 12 |
| Pulo Gadung | 2, 4 |
| Cempaka Mas / Simpang Cempaka | 2, 10 |
| Senen Toyota Rangga / Jaga Jakarta | 2, 5, 14 |
| Senen Raya | 2, 14 |
| Juanda / Pecenongan | 2, 8 |
| Damai / Jelambar | 3, 8 |
| Grogol / Grogol Reformasi | 3, 8, 9 |
| Petojo | 3, 8 |
| Simpang Pramuka / Pemuda Pramuka | 4, 10 |
| Matraman / Flyover Pramuka | 4, 5 |
| Gunung Sahari / Jembatan Merah | 5, 12 |
| Bali Mester / St. Jatinegara / Kampung Melayu | 5, 11 |
| Simpang Kuningan / Underpass Kuningan | 6, 9 |
| Cawang Cililitan | 7, 10 |
| Cawang Sentral | 7, 9, 10 |
| Cawang | 7, 9 |
| Kebayoran / Velbak | 8, 13 |
| Tanjung Duren | 8, 9 |
| Penjaringan / Pluit | 9, 12 |
| Tanjung Priok / Mambo / Koja /|Plumpang / Sunter Kelapa Gading | 10, 12 |
| Flyover Jatinegara | 10, 11 |
| Landasan Pacu / Danau Agung / Danau Sunter | 12, 14 |

---

## 11. Fares, e-money and ticketing

Source: id.wikipedia.org/wiki/Transjakarta § *Tiket dan tarif*.

| Product | Fare | Notes |
|---|---|---|
| **Layanan Ekonomi** | **Rp2,000** flat | 05:00–07:00 WIB only |
| **Layanan Reguler** | **Rp3,500** flat | 07:00–23:59 and 00:01–04:59 WIB |

The fare is **flat, not distance-based**, and is determined by the **tap-in time**. It is set by a Governor of DKI Jakarta decree and subsidised from the DKI Jakarta provincial budget (APBD). On Jakarta's birthday (22 June) and New Year's Day (1 January) the service is free.

**Integration tariffs**

* **OKOTRIP scheme** — using a JakLingko **co-branded** e-money card (KUE) you can move between Transjakarta BRT and NBRT services paying a **maximum of Rp5,000 within a 3-hour window**. The co-branded card *only* supports the OKOTRIP tariff and cannot be used for the multimodal integration tariff.
* **Multimodal integration scheme** — account-based e-ticketing lets MRT Jakarta + LRT Jakarta + Transjakarta be used as one journey with a **maximum of Rp10,000 within 3 hours**; the first mode is charged at its normal fare and each subsequent mode at **Rp250 per km**. Passengers select more than one mode in the JakLingko app (for Transjakarta this applies to MetroTrans and MiniTrans services).

**Payment instruments**

* **JakLingko** — the umbrella brand; its app (and the TJ:Transjakarta app) issues a QR code ticket; MetroTrans and MiniTrans use **tap-on-bus (TOB)** readers to scan the QR / NFC code.
* **Bank e-money KUE**: Mandiri e-Money, BNI TapCash, BRI Brizzi, BCA Flazz, Bank Jakarta JakCard (formerly Bank DKI).
* **KLG (Kartu Layanan Gratis)** — free-travel card, for people over 60, Thousand Islands residents, people with disabilities, low-income households, teachers, jumantik cadres and mosque administrators.
* **QRIS Tap** — NFC QRIS-based tap-on-bus payments, rolled out across RoyalTrans from 17 March 2025 and extended to the wider network.
* Historic: magnetic single-trip tickets (present card) issued by Bank DKI, and paper tickets (karcis kertas) for feeder buses. Magnetic single-trip ticketing was discontinued; feeder services now use tap-on-bus.

**Mikrotrans fares.** The Mikrotrans class is reported as operating on a **flat fare** integrated with the JakLingko/OKOTRIP e-money system (all Mikrotrans routes run 05:00–22:00 daily per Wikipedia). Note that the Wikipedia *Mikrotrans* article still contains a sentence saying the operator is paid "berdasarkan jarak yang ditempuh" (by distance travelled), which contradicts the flat-fare description — this is flagged as an unresolved point, see §13.

**Microtrans vs. feeder fare caveat.** The official site publishes no tariff table; all fares above come from Wikipedia, which cites Governor decrees. Verify against PPID (`ppid.transjakarta.co.id`) before production use.

---

## 12. Official accounts, apps and contact points

| Channel | Handle / URL |
|---|---|
| **X (Twitter)** | **[@pt_transjakarta](https://x.com/pt_transjakarta)** |
| Instagram | [@pt_transjakarta](https://www.instagram.com/pt_transjakarta) and [@infotije](https://www.instagram.com/infotije) |
| Facebook | [facebook.com/Transjakarta](https://id-id.facebook.com/Transjakarta) |
| YouTube | [@TransportasiJakarta](https://www.youtube.com/@TransportasiJakarta) |
| LinkedIn | [PT. Transportasi Jakarta](https://id.linkedin.com/company/pt.-transportasi-jakarta-transjakarta-) |
| Website | [transjakarta.co.id](https://transjakarta.co.id/) |
| PPID portal | [ppid.transjakarta.co.id](https://ppid.transjakarta.co.id/) |
| App (Android) | `com.transjakmobile` — *TJ:Transjakarta* |
| App (iOS) | [id6502437836](https://apps.apple.com/id/app/tj-transjakarta/id6502437836) |
| WhatsApp | +62 818-0450-0102 |
| Customer service | **1500102** (national), 081804500102, `naektije@transjakarta.co.id` |
| Corporate address | PT Transportasi Jakarta, Jalan Mayjen Soetoyo No. 1, Jakarta Timur 13650 |

---

## 13. Caveats and open uncertainties

1. **`api.transjakarta.co.id` was down.** Connection refused on every tested port, from two independent clients. The endpoint paths (`/v3/bus`, `/v3/routes`, `/v3/stops`) and any auth scheme are therefore **unverified** in this dossier. Re-test before building against them.
2. **No public GTFS feed found.** `gtfs.transjakarta.co.id` is the internal CMS upload tool, not a data feed.
3. **Lengths disagree between Wikipedia sources.** The *Koridor Utama* summary table and the per-corridor infoboxes differ for corridors 5, 9, 10, 11 and 12. Both figures are recorded per corridor in the JSON (`lengthKm`, `lengthKmNote`).
4. **Operator attribution is Wikipedia-sourced, not official.** transjakarta.co.id does not publish per-route operators, and the Wikipedia operator list still references many routes that are no longer published (4H, 4M, L4, 5D, 5E, 5H, 5K, 7M, L7, 9M, 9K, 11V, 12M, L10, L6, 1N, 1V, 1K, 1T, 2F, 3C, 11C, 11M, 12C, 12F). Treat the `operator` field as indicative.
5. **The MiniTrans route list is inferred, not published.** The official site has no MiniTrans layer. The 59 routes listed under `transjakarta-minitrans` are the non-BRT routes whose operator (per Wikipedia) is one of the five medium-bus operators; a route can be partly MiniTrans and partly MetroTrans across different trips.
6. **Map vintages differ.** Official route maps range from 12 December 2024 to 6 October 2026. Where a route was re-mapped, the older map may still show superseded halte. Each corridor's map date is in the JSON.
7. **Coordinates are OSM-derived**, matched by stop name. Where the OSM name differs from the official map name the coordinate is left `null` rather than guessed. OSM stop lists are occasionally shorter than the official halte list; the official list is authoritative for order and naming.
8. **Mikrotrans fare** — the flat-fare/distance-based conflict described in §11 is unresolved from the sources consulted.
9. **Corridor 14 ridership is low** (525,643 passengers in 2024) because it opened mid-2024 and its JIS terminus is event-driven. Corridors 1 (20.86 M), 9 (19.48 M) and 13 (13.07 M) were the busiest in 2024; Mikrotrans as a class carried 169.05 M passengers vs BRT's 139.06 M in 2024.
10. **No corridor 15/16/17/18** exists — see §1.

---

## 14. Source URLs

### Official — transjakarta.co.id

* https://transjakarta.co.id/
* https://transjakarta.co.id/layanan
* https://transjakarta.co.id/layanan/brt
* https://transjakarta.co.id/layanan/mikrotrans
* https://transjakarta.co.id/layanan/angkutan-pengumpan
* https://transjakarta.co.id/layanan/royaltrans
* https://transjakarta.co.id/rute
* https://transjakarta.co.id/berita
* https://transjakarta.co.id/komersial
* https://transjakarta.co.id/tentang/sejarah
* https://ppid.transjakarta.co.id/
* https://smk.transjakarta.co.id/aset/berkas/rute/  *(193 official route-map images; pattern `<CODE>-<YYYYMMDD>.<jpg|jpeg>`)*

### API / GTFS probes

* https://api.transjakarta.co.id/v3/bus  *(connection refused)*
* https://api.transjakarta.co.id/v3/routes  *(connection refused)*
* https://api.transjakarta.co.id/v3/stops  *(connection refused)*
* https://gtfs.transjakarta.co.id/  *(CMS login page, HTTP 200)*
* https://gtfs.transjakarta.co.id/gtfs.zip  *(HTTP 404)*

### Wikipedia (id)

* https://id.wikipedia.org/wiki/Transjakarta
* https://id.wikipedia.org/wiki/Mikrotrans
* https://id.wikipedia.org/wiki/Layanan_pengumpan_dalam_kota_(Transjakarta)
* https://id.wikipedia.org/wiki/Jak_Lingko
* https://id.wikipedia.org/wiki/Koridor_1_Transjakarta … https://id.wikipedia.org/wiki/Koridor_14_Transjakarta
* https://id.wikipedia.org/wiki/Koridor_15_Transjakarta  *(redirect — no corridor 15)*

### OpenStreetMap

* Overpass API — `https://overpass-api.de/api/interpreter`
* Query used: `rel["type"="route"]["route"="bus"]["network"~"Transjakarta",i]; (._;>;); out body qt;`
* 288 route relations returned, 150 distinct route refs, 128 routes with named stop nodes (2,665 stop entries).

### Social

* https://x.com/pt_transjakarta
* https://www.instagram.com/pt_transjakarta
* https://www.instagram.com/infotije
* https://id-id.facebook.com/Transjakarta
* https://www.youtube.com/@TransportasiJakarta
