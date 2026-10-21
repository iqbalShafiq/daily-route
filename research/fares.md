# Fares for public transport in Greater Jakarta

**Research date:** 21 October 2026 (Asia/Jakarta)
**Scope:** Transjakarta (BRT, Metrotrans, Minitrans, Mikrotrans, Royaltrans), MRT Jakarta, LRT Jakarta (Jakpro), LRT Jabodebek, KRL Jabodetabek (KAI Commuter), and the inter-change / integration rules between them.
**Companion data file:** [`data/fares.json`](./data/fares.json)

---

## 0. Method, and how to read this report

The built-in `web_search` tool was unusable in this environment (every call returned
`HTTP 401 — Authentication Fails … web-search-deepseek.baseURL`). All research was
therefore done with `web_fetch`, direct `curl` against operator sites, the
`r.jina.ai` text proxy, the Wikipedia `action=raw` API, and the Wayback Machine
(CDX + archived snapshots).

Rules applied:

* Every number below is followed by the URL that was actually read.
* Where a source is a **news** site, the article body was read (not only a search
  snippet), unless the citation says *"headline + RSS snippet only"*.
* Where a source is an **operator** site, that is preferred and the page is
  linked directly. Two operator pages are only reachable through the Wayback
  Machine (`web.archive.org`); those are marked as archived snapshots with the
  capture date.
* Anything that could not be verified is listed explicitly in
  [§8 Unverified / unknown](#8-unverified--unknown).

### Terminology note on "Jakpro"

In the platform's scope, **"Jakpro"** is used as the label for the *flat
Transjakarta fare* (PT Jakarta Propertindo / Jakpro is the DKI Jakarta
transportation holding company that owns LRT Jakarta and Transjakarta; it is
also the official name of the **tariff integration programme** run with
JakLingko Indonesia). The fare rules below use:

* **Layanan Ekonomi** — the Rp 2.000 early-morning tariff (05:00–07:00 WIB).
* **Layanan Reguler** — the Rp 3.500 tariff that applies at every other time.

---

## 1. Transjakarta — the flat "Jakpro" fare

### 1.1 The fare

| Service | Time window (WIB) | Fare | Label |
|---|---|---|---|
| Layanan Ekonomi | **05:00 – 07:00** | **Rp 2.000** | early-morning cheap window |
| Layanan Reguler | 07:00 – 23:59 and 00:01 – 04:59 | **Rp 3.500** | every other time, including the 16:00–19:00 evening peak |

* The band is decided by the **tap-in time**, not the tap-out time
  (Wikipedia's footnote: *"Penetapan tarif didasarkan pada waktu saat melakukan
  pengetapan masuk (tapping in)"*).
* The fare is **flat**: there is no distance component, and the same price is
  paid for a one-stop ride and for a cross-city ride.

**Sources read**

* Official Transjakarta, *Info Tiket* page (archived):
  <https://web.archive.org/web/20161004013335/http://transjakarta.co.id/produk-dan-layanan/info-tiket/>
  — verbatim: *"Tarif TransJakarta & Transjabodetabek — Pkl. 05.00 – Pkl. 07.00 WIB:
  Rp. 2.000 / Pkl. 07.00 – Pkl. 24.00 WIB: Rp. 3.500 / Pkl. 24.00 – Pkl. 05.00 WIB:
  Rp. 3.500"*.
* Current text, id.wikipedia, *Transjakarta* § **Tiket dan tarif** → § **Tarif**
  (raw revision read via
  <https://id.wikipedia.org/w/index.php?title=Transjakarta&action=raw>):
  *"Tarif Transjakarta pada pukul 05.00 s.d. 07.00 WIB sebesar Rp 2.000,00, yang
  dikenal dengan Layanan Ekonomi. Sedangkan pada pukul 07.00 s.d. 23.59 WIB dan
  00.01 s.d. 04.59 WIB, berlaku Layanan Reguler dengan tarif sebesar Rp3.500,00."*
  The same section states the fare is set by a Governor's decree, is subsidised
  from the DKI Jakarta provincial budget (APBD), that on public holidays the
  fare may be waived or reduced to Rp 1,00, that night services (*Amari*,
  *Andini*) still cost Rp 3.500, and that **KLG** (Kartu Layanan Gratis) holders
  travel free.

### 1.2 Flat per journey — and what a transfer costs

The Transjakarta fare is **per boarding**, not per trip. A rider who changes
vehicles makes a second tap-in and pays the fare again, *unless* one of the two
integration schemes in [§6](#6-interchange-and-integration-rules) applies.

Sources: the *Tarif* and *Tarif integrasi* paragraphs of the same Wikipedia
revision; corroborated by the JakLingko operator FAQ, which states that a
"perjalanan hanya menggunakan satu moda (tidak terjadi integrasi antarmoda,
sehingga dikenakan tarif flat/jarak reguler satu moda)" — i.e. the single-mode
fare is charged, and that a mode *not* covered by the scheme **breaks** the
integration (<https://jaklingkoindonesia.co.id/faq-tarif-integrasi>).

**Microtrans / Minitrans / Metrotrans (the non-BRT "Angkutan Pengumpan")** ride
the same Rp 3.500 / Rp 2.000 flat fare as the BRT corridors. The Transjakarta
service pages for these classes publish the route list but no tariff table:

* <https://transjakarta.co.id/layanan/brt>
* <https://transjakarta.co.id/layanan/mikrotrans>
* <https://transjakarta.co.id/layanan/angkutan-pengumpan>
* <https://transjakarta.co.id/layanan/royaltrans>

### 1.3 Mikrotrans — currently free

**Microtrans is free for the passenger today** (it is not a distance-based
rider fare). The rider must still tap an e-money card; the *operator* is paid
per distance travelled.

* id.wikipedia, *Mikrotrans* (raw revision read):
  <https://id.wikipedia.org/w/index.php?title=Mikrotrans&action=raw>
  — *"Mikrotrans tidak mengenakan biaya alias gratis untuk menaikinya, tetapi
  tetap harus menempel kartu uang elektronik (e seperti e-Money …). Skema yang
  diterapkan dalam program Mikrotrans ini menggunakan pembayaran kepada operator
  berdasarkan jarak yang ditempuh."*
* Kompas, 8 July 2026 (body read):
  <https://travel.kompas.com/read/2026/07/08/062718627/tarif-transjakarta-hingga-transjabodetabek-diusulkan-naik-jadi-berapa>
  — *"Tarif Transjakarta layanan BRT dan non-BRT diusulkan naik dari Rp 3.500
  jadi Rp 5.000. Termasuk tarif Mikrotrans yang semula gratis, akan berbayar
  dengan tarif Rp 2.000."*
* VIVA, 8 July 2026 (body read):
  <https://www.viva.co.id/berita/metro/1912034-jaklingko-diusulkan-tak-lagi-gratis-tarif-mikrotrans-berpotensi-naik-jadi-rp2000-per-perjalanan>
  — *"DTKJ mengusulkan agar tarif Mikrotrans JakLingko tak lagi gratis dan
  menjadi Rp2.000 per perjalanan."*

> **The Rp 2.000 Mikrotrans fare is a *proposal* (DTKJ, July 2026) for the
> 1 January 2027 restructuring. It is not in force.** As of 21 October 2026 the
> Mikrotrans fare is **Rp 0 (free)**.

### 1.4 Minitrans

No official tariff table for Minitrans exists on any operator site read
(Transjakarta's own service pages, the Transjakarta app listing, JakLingko's
FAQ). Minitrans is a non-BRT feeder class and is therefore treated here as
riding the same Rp 3.500 / Rp 2.000 flat fare as the other non-BRT services.
**The specific Minitrans tariff could not be verified from an operator source**
— see [§8](#8-unverified--unknown).

### 1.5 Royaltrans — the premium, non-subsidised product

Royaltrans is a **separate, non-subsidised** product and is *not* covered by
the Rp 3.500 / Rp 2.000 flat fare, by OKOTRIP, or by the Rp 10.000 multimodal
integration.

* **Rp 20.000 flat** for all Royaltrans routes. Source: detikNews, 23 August
  2023 (body read) quoting Transjakarta's Director of Operations and Safety,
  Daud Joseph: <https://news.detik.com/berita/d-6891014/transjakarta-tarif-bus-royaltrans-tetap-rp-20-000>
  — *"tarif Royaltrans tetap Rp 20.000"*. The same statement was reported by
  detikFinance (<https://finance.detik.com/berita-ekonomi-bisnis/d-6892188/transjakarta-batal-naikkan-tarif-royaltrans>).
* Royaltrans is not discounted on public holidays (Wikipedia *Transjakarta* §
  Tarif).
* Official route list (11 routes): <https://transjakarta.co.id/layanan/royaltrans>
  — S31 Bintaro–Fatmawati, 1T Cibubur–Balai Kota, 1K Cibubur–Blok M, 6P Cibubur–Kuningan, D32 Cinere–Bundaran Senayan, D31 Cinere–Kuningan, B13 Summarecon Bekasi–Blok M, B14 Summarecon Bekasi–Kuningan, S14 Summarecon Serpong–Lebak Bulus, S12 Terminal BSD–Fatmawati.

> **Discrepancy:** id.wikipedia still says Royaltrans costs *"Rp20.000,00 hingga
> Rp35.000,00"*, which is the 2018 launch range. The current official figure
> quoted by the operator is **Rp 20.000 flat**.

### 1.6 Payment methods relevant to a journey

From the *Tiket elektronik* and *Dompet Elektronik* sections of the Wikipedia
revision, and the JakLingko operator FAQ:

* **Accepted cards at Transjakarta barriers:** BRIZZI (BRI), TapCash (BNI),
  e-Money (Mandiri), Flazz (BCA), JakCard (Bank Jakarta), and Kartu Multi Trip
  (KAI Commuter — **BRT haltes only**).
* **JakLingko co-branded cards** (JakLingko × the five bank KUE above) are
  sold at ticket vending machines for Rp 40.000 with Rp 10.000 balance, and
  **only** support the OKOTRIP tariff — they cannot be used for the multimodal
  integration tariff.
* **Account-based ticketing (ABT)** through the JakLingko app: a *virtual
  e-ticket* or an ABT QR code; this is the mechanism for the Rp 10.000
  integration.
* **QRIS Tap** (NFC tap-to-pay, launched by Bank Indonesia 14 March 2025) —
  available on **all Royaltrans services since 17 March 2025** and being rolled
  out to feeder routes and BRT turnstiles from October 2025. Tap-in and tap-out
  are still required.
* **Minimum balance Rp 5.000** and **fare collection at tap-out** since
  4 October 2022; a missing tap-out blocks the card and the rider has to settle
  at the counter.
* **KLG (Kartu Layanan Gratis)** — free travel for eligible groups (15 groups
  as of May 2025; the government plans to widen this to 21 groups).
* The same bank e-money cards also work on **KRL, LRT Jakarta, MRT Jakarta and
  LRT Jabodebek**, but each operator charges its own tariff (see §6).

---

## 2. MRT Jakarta (Ratangga, NS line)

### 2.1 Structure: progressive **per station passed**, not per km

| Item | Value |
|---|---|
| Minimum fare | **Rp 3.000** |
| Increment | **+Rp 1.000 per station passed** |
| Maximum fare | **Rp 14.000** (Lebak Bulus ↔ Bundaran HI) |
| Effective from | **1 April 2019** (set 26 March 2019) |
| Time-of-day bands | **none** — one tariff all day |

* id.wikipedia, *MRT Jakarta* § **Tarif** (raw revision read):
  <https://id.wikipedia.org/w/index.php?title=MRT_Jakarta&action=raw>
  — *"Tarif awal yang dikenakan sebesar Rp3.000 sebagai tarif minimal dan
  bertambah Rp1.000 setiap melewati stasiun. Tarif tertinggi sebesar Rp14.000,
  yaitu perjalanan dari Stasiun Lebak Bulus ke Stasiun Bundaran HI. Tarif ini
  mulai berlaku pada tanggal 1 April 2019."* The full 13×13 fare matrix is
  reproduced there.
* Kompas headline + body, 27 March 2019 (read):
  <https://megapolitan.kompas.com/read/2019/03/27/09421241/tarif-mrt-rp-3000-rp-14000-berlaku-1-april-2019>
  — *"Tarif MRT Rp 3.000-Rp 14.000 Berlaku 1 April 2019"*.
* id.wikipedia cites CNBC Indonesia, 26 March 2019, *"Semua Sepakat! Ini Dia Tarif
  Resmi MRT Jakarta Antar-Stasiun"*
  (<https://www.cnbcindonesia.com/news/20190326165052-4-63025/semua-sepakat-ini-dia-tarif-resmi-mrt-jakarta-antar-stasiun>)
  — **headline + snippet only; the page itself was not read.**

**Notes that matter for routing**

* The fare is a step function of the number of stations passed, so a planner
  must count stops, not kilometres. Two adjacent stations can cost Rp 3.000
  while a slightly longer ride costs Rp 4.000.
* Same-station entry and exit is charged the lowest tariff and must be
  validated with the JakLingko exit validator.
* On days the operator declares a celebration, the fare can be Rp 1,00.
* `allride` products (Charm ticket, `allride` Poin, MAXRIDE subscription) are
  quota/subscription products, not a different per-journey tariff.
* **To ride MRT Jakarta with a Kartu Multi Trip the card must hold at least
  Rp 14.000** (Wikipedia *MRT Jakarta* § payment).

### 2.2 Transfers

There is **no free transfer** between MRT and any other mode. A change from
Ratangga to LRT Jakarta or Transjakarta is only covered by the JakLingko
multimodal integration tariff (see §6).

---

## 3. LRT Jakarta (Jakpro)

### 3.1 The fare: flat Rp 5.000, any distance

| Item | Value |
|---|---|
| Fare | **Rp 5.000 flat** per journey |
| Distance | **no distance component** — *"berlaku sama untuk jarak jauh maupun dekat semua stasiun"* |
| Effective from | **1 December 2019** (commercial launch) |
| Time-of-day bands | **none** |

**Official source (operator FAQ, read):** <https://www.lrtjakarta.co.id/faq>
— two answers in the *"Pertanyaan dalam Kategori Tarif Perjalanan"* category:

* *"Berapa tarif perjalanan LRT Jakarta? — Tarif tiket LRT Jakarta sudah
  ditetapkan sejak per tanggal 1 Desember 2019 sebesar Rp 5.000 untuk satu
  kali perjalanan berlaku sama untuk jarak jauh maupun dekat semua stasiun."*
* *"Berapa harga tarif LRT Jakarta dan cara membelinya? — Tarif tiket LRT
  Jakarta flat sebesar Rp5.000,- untuk 1 kali perjalanan. Para penumpang dapat
  membeli tiket pada Ticket Vending Machine (TVM) atau Passenger Agent Office
  (PAO)."*

(The FAQ content is server-rendered inside the page's `__NEXT_DATA__` payload;
it is visible without JavaScript.)

### 3.2 Tickets, minimum balances, penalties (same official FAQ)

| Item | Value |
|---|---|
| Single Journey Trip (SJT) card | **Rp 15.000** (Rp 10.000 card + Rp 5.000 single trip), **no refund** |
| Paid-area overstay penalty | Rp 5.000 if more than 2 hours in the paid area without tapping out |
| Minimum KUE balance | **Rp 5.000** (e-Money, Flazz, TapCash, Brizzi, JakCard, JakLingko) |
| Accepted e-money | e-Money (Mandiri), Flazz (BCA), TapCash (BNI), Brizzi (BRI), JakCard (Bank DKI), JakLingko, Kartu Multi Trip (KAI Commuter) |
| Park & Ride | Rp 5.000 (car) / Rp 2.000 (motorcycle), Mon–Fri 05:30–24:00 |
| Other payments | LinkAja (QR) since 3 Aug 2020; JakLingko app QR / ABT QR; LarataPay (Bank DKI wallet, launched 1 Dec 2024) |

> **Discrepancy:** id.wikipedia states the minimum KUE balance is **Rp 8.500**;
> the operator's own FAQ says **Rp 5.000**. The operator figure is used here.

### 3.3 Relationship to the "Jakpro" flat fare and to Transjakarta

LRT Jakarta is **not** on the Rp 3.500 Transjakarta tariff. It has its own
flat Rp 5.000 fare, it is one of the three operators inside the JakLingko
Rp 10.000 multimodal scheme, and a JakLingko co-branded card can be used on it.

* id.wikipedia, *LRT Jakarta* (raw revision read):
  <https://id.wikipedia.org/w/index.php?title=LRT_Jakarta&action=raw>
* JakLingko operator FAQ: <https://jaklingkoindonesia.co.id/faq-tarif-integrasi>

### 3.4 Fase 1B and a 2027 fare change

Fase 1B (Pegangsaan Dua ↔ Manggarai) was opened on **16 September 2026**
(12.2 km, eight stations). During the trial stage the fare for the fase 1B
section was set at Rp 8.00 by Governor Pramono (id.wikipedia *LRT Jakarta*,
read). Separately, the DKI government announced on 30 September 2026 that
**LRT Jakarta's tariff will also be adjusted on 1 January 2027** — the new
amount has not been published.

---

## 4. LRT Jabodebek

### 4.1 Structure: distance-based, published both as a rule and as a full matrix

Set by the Ministry of Transport: **Kepmenhub No. KM 67/2023** on the fare for
integrated light rail in Jakarta, Bogor, Depok and Bekasi for the public
service obligation, **as amended by Kepmenhub No. KM 70/2024**.

| Band | 1st km | Each further km | Maximum |
|---|---|---|---|
| **Peak** — Mon–Fri (outside public holidays) **06:00–08:59** and **16:00–19:59** | Rp 5.000 | **Rp 700** | **Rp 20.000** |
| **Off-peak** — Mon–Fri, outside the two peak windows | Rp 5.000 | **Rp 700** | **Rp 10.000** |
| **Sat, Sun and public holidays** (Tarif SML) | Rp 5.000 | **Rp 700** | **Rp 10.000** |

So the only difference between peak and off-peak is the **cap**; the unit rate
is the same.

**Official source (operator page, read — the three tables are in the page
HTML):** <https://lrtjabodebek.kai.id/informasi-tarif>
— the page carries three tabs, *"Tarif Diluar Jam Sibuk"*, *"Tarif Jam Sibuk"*
and *"Tarif SML (Sabtu, Minggu & Hari Libur)"*, and the footnote
*"Jam Sibuk dimulai dari jam 06:00 s/d 08:59 dan 16:00 s/d 19:59."*

**Corroboration:** id.wikipedia, *LRT Jabodebek* § **Tarif perjalanan** (raw
revision read):
<https://id.wikipedia.org/w/index.php?title=LRT_Jabodebek&action=raw> —
reproduces exactly the same three-row table and names the two decrees. The
companion article *Daftar tarif LRT Jabodebek* is the same matrix:
<https://id.wikipedia.org/w/index.php?title=Daftar_tarif_LRT_Jabodebek&action=raw>

**Minimum = Rp 5.000, maximum = Rp 20.000.**

### 4.2 The full official per-station matrix

The 18 phase-1 stations (official list:
<https://lrtjabodebek.kai.id/daftar-stasiun-lrt-jabodebek>) are, in the order
used by the operator's own table: Dukuh Atas BNI, Setiabudi, Rasuna Said,
Kuningan, Pancoran bank bjb, Cikoko, Ciliwung, Cawang, Halim, Jati Bening
Baru, Cikunir 1, Cikunir 2, Bekasi Barat, Jati Mulya, Harjamukti, Kampung
Rambutan, Ciracas, Taman Mini.

Rows are the origin, columns the destination, in that order. Values in Rupiah.
The *SML* table is identical to the *off-peak* table.

**Tarif Diluar Jam Sibuk (off-peak)**

| dari \ ke | Dukuh Atas BNI | Setiabudi | Rasuna Said | Kuningan | Pancoran bank bjb | Cikoko | Ciliwung | Cawang | Halim | Jati Bening Baru | Cikunir 1 | Cikunir 2 | Bekasi Barat | Jati Mulya | Harjamukti | Kampung Rambutan | Ciracas | Taman Mini |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dukuh Atas BNI | 5000 | 5000 | 5700 | 7100 | 8500 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Setiabudi | 5000 | 5000 | 5000 | 6400 | 7800 | 9200 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Rasuna Said | 5700 | 5000 | 5000 | 5000 | 6400 | 7800 | 8500 | 9200 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Kuningan | 7100 | 6400 | 5000 | 5000 | 5700 | 7100 | 7800 | 8500 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Pancoran bank bjb | 8500 | 7800 | 6400 | 5700 | 5000 | 5700 | 6400 | 7100 | 9200 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Cikoko | 9900 | 9200 | 7800 | 7100 | 5700 | 5000 | 5000 | 5700 | 7800 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 |
| Ciliwung | 10000 | 9900 | 8500 | 7800 | 6400 | 5000 | 5000 | 5000 | 7100 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9200 |
| Cawang | 10000 | 10000 | 9200 | 8500 | 7100 | 5700 | 5000 | 5000 | 7100 | 9200 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 10000 | 8500 |
| Halim | 10000 | 10000 | 10000 | 10000 | 9200 | 7800 | 7100 | 7100 | 5000 | 7100 | 9200 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Jati Bening Baru | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 9200 | 7100 | 5000 | 6400 | 7100 | 9200 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Cikunir 1 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9200 | 6400 | 5000 | 5000 | 7800 | 9900 | 10000 | 10000 | 10000 | 10000 |
| Cikunir 2 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 7100 | 5000 | 5000 | 7100 | 9200 | 10000 | 10000 | 10000 | 10000 |
| Bekasi Barat | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9200 | 7800 | 7100 | 5000 | 6400 | 10000 | 10000 | 10000 | 10000 |
| Jati Mulya | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 9200 | 6400 | 5000 | 10000 | 10000 | 10000 | 10000 |
| Harjamukti | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 5000 | 9200 | 8500 | 10000 |
| Kampung Rambutan | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9200 | 5000 | 5700 | 5700 |
| Ciracas | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 8500 | 5700 | 5000 | 7100 |
| Taman Mini | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 9200 | 8500 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 5700 | 7100 | 5000 |

**Tarif Jam Sibuk (peak)**

| dari \ ke | Dukuh Atas BNI | Setiabudi | Rasuna Said | Kuningan | Pancoran bank bjb | Cikoko | Ciliwung | Cawang | Halim | Jati Bening Baru | Cikunir 1 | Cikunir 2 | Bekasi Barat | Jati Mulya | Harjamukti | Kampung Rambutan | Ciracas | Taman Mini |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dukuh Atas BNI | 5000 | 5000 | 5700 | 7100 | 8500 | 9900 | 10600 | 11300 | 13400 | 16200 | 18300 | 19000 | 20000 | 20000 | 20000 | 16200 | 17600 | 14800 |
| Setiabudi | 5000 | 5000 | 5000 | 6400 | 7800 | 9200 | 9900 | 10600 | 12700 | 15500 | 17600 | 18300 | 20000 | 20000 | 20000 | 15500 | 16900 | 14100 |
| Rasuna Said | 5700 | 5000 | 5000 | 5000 | 6400 | 7800 | 8500 | 9200 | 12000 | 14100 | 16200 | 16900 | 19700 | 20000 | 19700 | 14800 | 16200 | 13400 |
| Kuningan | 7100 | 6400 | 5000 | 5000 | 5700 | 7100 | 7800 | 8500 | 11300 | 13400 | 15500 | 16200 | 19000 | 20000 | 19000 | 14100 | 15500 | 12700 |
| Pancoran bank bjb | 8500 | 7800 | 6400 | 5700 | 5000 | 5700 | 6400 | 7100 | 9200 | 12000 | 14100 | 14800 | 17600 | 19700 | 17600 | 12700 | 13400 | 11300 |
| Cikoko | 9900 | 9200 | 7800 | 7100 | 5700 | 5000 | 5000 | 5700 | 7800 | 10600 | 12700 | 13400 | 16200 | 18300 | 16200 | 11300 | 12000 | 9900 |
| Ciliwung | 10600 | 9900 | 8500 | 7800 | 6400 | 5000 | 5000 | 5000 | 7100 | 9900 | 12000 | 12700 | 15500 | 17600 | 15500 | 10600 | 11300 | 9200 |
| Cawang | 11300 | 10600 | 9200 | 8500 | 7100 | 5700 | 5000 | 5000 | 7100 | 9200 | 11300 | 12000 | 14800 | 16900 | 14800 | 9900 | 11300 | 8500 |
| Halim | 13400 | 12700 | 12000 | 11300 | 9200 | 7800 | 7100 | 7100 | 5000 | 7100 | 9200 | 9900 | 12000 | 14800 | 17600 | 12000 | 13400 | 10600 |
| Jati Bening Baru | 16200 | 15500 | 14100 | 13400 | 12000 | 10600 | 9900 | 9200 | 7100 | 5000 | 6400 | 7100 | 9200 | 12000 | 20000 | 14800 | 16200 | 13400 |
| Cikunir 1 | 18300 | 17600 | 16200 | 15500 | 14100 | 12700 | 12000 | 11300 | 9200 | 6400 | 5000 | 5000 | 7800 | 9900 | 20000 | 16900 | 18300 | 15500 |
| Cikunir 2 | 19000 | 18300 | 16900 | 16200 | 14800 | 13400 | 12700 | 12000 | 9900 | 7100 | 5000 | 5000 | 7100 | 9200 | 20000 | 17600 | 19000 | 16200 |
| Bekasi Barat | 20000 | 20000 | 19700 | 19000 | 17600 | 16200 | 15500 | 14800 | 12000 | 9200 | 7800 | 7100 | 5000 | 6400 | 20000 | 20000 | 20000 | 19000 |
| Jati Mulya | 20000 | 20000 | 20000 | 20000 | 19700 | 18300 | 17600 | 16900 | 14800 | 12000 | 9900 | 9200 | 6400 | 5000 | 20000 | 20000 | 20000 | 20000 |
| Harjamukti | 20000 | 20000 | 19700 | 19000 | 17600 | 16200 | 15500 | 14800 | 17600 | 20000 | 20000 | 20000 | 20000 | 20000 | 5000 | 9200 | 8500 | 10600 |
| Kampung Rambutan | 16200 | 15500 | 14800 | 14100 | 12700 | 11300 | 10600 | 9900 | 12000 | 14800 | 16900 | 17600 | 20000 | 20000 | 9200 | 5000 | 5700 | 5700 |
| Ciracas | 17600 | 16900 | 16200 | 15500 | 13400 | 12000 | 11300 | 11300 | 13400 | 16200 | 18300 | 19000 | 20000 | 20000 | 8500 | 5700 | 5000 | 7100 |
| Taman Mini | 14800 | 14100 | 13400 | 12700 | 11300 | 9900 | 9200 | 8500 | 10600 | 13400 | 15500 | 16200 | 19000 | 20000 | 10600 | 5700 | 7100 | 5000 |

**Tarif SML (Sabtu, Minggu & Hari Libur)**

| dari \ ke | Dukuh Atas BNI | Setiabudi | Rasuna Said | Kuningan | Pancoran bank bjb | Cikoko | Ciliwung | Cawang | Halim | Jati Bening Baru | Cikunir 1 | Cikunir 2 | Bekasi Barat | Jati Mulya | Harjamukti | Kampung Rambutan | Ciracas | Taman Mini |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dukuh Atas BNI | 5000 | 5000 | 5700 | 7100 | 8500 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Setiabudi | 5000 | 5000 | 5000 | 6400 | 7800 | 9200 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Rasuna Said | 5700 | 5000 | 5000 | 5000 | 6400 | 7800 | 8500 | 9200 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Kuningan | 7100 | 6400 | 5000 | 5000 | 5700 | 7100 | 7800 | 8500 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Pancoran bank bjb | 8500 | 7800 | 6400 | 5700 | 5000 | 5700 | 6400 | 7100 | 9200 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Cikoko | 9900 | 9200 | 7800 | 7100 | 5700 | 5000 | 5000 | 5700 | 7800 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 |
| Ciliwung | 10000 | 9900 | 8500 | 7800 | 6400 | 5000 | 5000 | 5000 | 7100 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9200 |
| Cawang | 10000 | 10000 | 9200 | 8500 | 7100 | 5700 | 5000 | 5000 | 7100 | 9200 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 10000 | 8500 |
| Halim | 10000 | 10000 | 10000 | 10000 | 9200 | 7800 | 7100 | 7100 | 5000 | 7100 | 9200 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Jati Bening Baru | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 9200 | 7100 | 5000 | 6400 | 7100 | 9200 | 10000 | 10000 | 10000 | 10000 | 10000 |
| Cikunir 1 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9200 | 6400 | 5000 | 5000 | 7800 | 9900 | 10000 | 10000 | 10000 | 10000 |
| Cikunir 2 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 7100 | 5000 | 5000 | 7100 | 9200 | 10000 | 10000 | 10000 | 10000 |
| Bekasi Barat | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9200 | 7800 | 7100 | 5000 | 6400 | 10000 | 10000 | 10000 | 10000 |
| Jati Mulya | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 9200 | 6400 | 5000 | 10000 | 10000 | 10000 | 10000 |
| Harjamukti | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 5000 | 9200 | 8500 | 10000 |
| Kampung Rambutan | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 9200 | 5000 | 5700 | 5700 |
| Ciracas | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 8500 | 5700 | 5000 | 7100 |
| Taman Mini | 10000 | 10000 | 10000 | 10000 | 10000 | 9900 | 9200 | 8500 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 10000 | 5700 | 7100 | 5000 |

### 4.3 Payment and the transfer rule

* **Payment (operator page, read):** <https://lrtjabodebek.kai.id/metode-pembayaran>
  — Kartu Multi Trip (KAI Commuter), bank e-money (e-Money, Brizzi, TapCash,
  Flazz, JakCard), JakLingko cards (Bank Jakarta, Mandiri, BRI, BNI),
  **Access by KAI** (purchase a ticket for a chosen origin–destination, valid
  same day only), **LinkAja** (QR, needs at least Rp 20.000 balance),
  **QRIS Tap** (live on all LRT Jabodebek stations since **30 October 2025**).
* **Minimum card balance Rp 10.000**; the first use of a card must be activated
  at a counter or ticket machine (id.wikipedia *LRT Jabodebek*, read).
* **No integrated ticket with KRL, MRT, LRT Jakarta or Transjakarta exists.**
  LRT Jabodebek is *not* one of the three operators in the JakLingko
  multimodal scheme (§6), and the operator's own "Rute Integrasi" page
  (<https://lrtjabodebek.kai.id/rute-integrasi>) only advertises *physical*
  walking/bridge connections, not a shared ticket. A rider changing between
  LRT Jabodebek and KRL/Transjakarta pays **two separate full fares**.
  (The integration map on that page is published only as an image whose
  referenced asset is served from a private IP and could not be read.)

---

## 5. KRL Jabodetabek (KAI Commuter)

### 5.1 The distance formula

| Item | Value |
|---|---|
| Base fare | **Rp 3.000** — covers the **first 25 km** |
| Increment | **+Rp 1.000 for every further 10 km** |
| Minimum | **Rp 3.000** |
| Maximum | **not published** (see §8) |
| Legal basis | Kepmenhub **No. 354/2020** (the structure itself inherited from **Permenhub 35/2016**) |
| Time-of-day bands | **none** |

**Official source (KAI Commuter's own news release, archived):**
<https://web.archive.org/web/2023/https://commuterline.id/informasi-publik/berita/tarif-commuterline-jabodetabek-masih-sesuai-dengan-keputusan-menteri-perhubungan-no-354-tahun-2020-kai-commuter-koordinasi-dengan-pemerintah-terkait-penyesuaian-tarif>
— *"Pada Keputusan Menteri tersebut besaran tarif perjalanan commuterline
Jabodetabek sebesar **Rp. 3.000,- untuk 25 km pertama**, dan ditambahkan
**Rp. 1.000,- untuk perjalanan setiap 10 kilometer berikutnya**. Besaran tarif
tersebut telah berjalan lebih dari lima tahun terakhir sesuai dengan Peraturan Menteri Transportasi nomor 35 tahun 2016."*
(the word-wrap in the archived page renders awkwardly; the two figures above are
verbatim.)

**Corroboration, read in full:** detikNews, 23 May 2025,
*"Bagaimana Cara Hitung Tarif KRL Jabodetabek?"*
<https://news.detik.com/berita/d-7929030/bagaimana-cara-hitung-tarif-krl-jabodetabek-simak-infonya>
— *"tarif KRL menggunakan sistem progresif, yakni sebesar Rp 3.000 untuk 25
kilometer pertama, lalu bertambah Rp 1.000 untuk setiap 10 kilometer berikutnya"*
and the worked example *"jika kamu naik dari Stasiun Bogor ke Stasiun Tanah
Abang … tarif yang dikenakan adalah Rp 3.000 + Rp 1.000, yaitu total Rp 4.000."*

**The fare did not change in 2026:** detikFinance, 26 June 2026, *"Tarif KRL
Dipastikan Tidak Naik!"* <https://finance.detik.com/infrastruktur/d-8549190/tarif-krl-dipastikan-tidak-naik>
— **headline + RSS snippet only; the page itself was not read.** The same
confirmation is carried by a 12 September 2024 report that the proposed
increase (base Rp 3.000 → Rp 5.000, increment unchanged at Rp 1.000) was
still undecided (<https://www.merdeka.com/uang/beredar-kabar-tarif-krl-bakal-naik-pt-kai-commuter-beri-jawaban-begini-196052-mvk.html>
— headline + RSS snippet only).

> **Discrepancy:** industry.co.id (9 Oct 2026) restates the tariff as *"Mulai
> Rp3.000 untuk 3 km pertama, naik Rp500 setiap 3 km berikutnya"* and *"Tiket
> Single Trip: Rp3.000 (jarak dekat) hingga Rp7.000 (jarak jauh)"*
> (<https://www.industry.co.id/read/157195/lengkap-rute-krl-commuter-line-2026-6-jalur-tarif-terbaru-dan-tips-naik-kereta>).
> That contradicts the operator's own published rule and is treated here as an
> error in that article. The operator's rule (25 km base) is used.

### 5.2 Ticket classes

There is **no class-based tariff inside Jabodetabek any more**:

* id.wikipedia, *KRL Commuter Line* (raw revision read):
  <https://id.wikipedia.org/w/index.php?title=KRL_Commuter_Line&action=raw>
  — *"Sekarang, Jalur ini hanya dilayani oleh KRL AC. KRL Ekonomi non-AC sudah
  dihentikan operasionalnya pada tahun 2013."* The AC Economy / *Commuter* /
  *Ekspres* naming survives only as a train-set/livery distinction; a commuter
  buys a single PSO-subsidised economy tariff, computed by distance.
* The **Tiket Harian Berjaminan (THB)** was abolished on **3 September 2022**;
  since then every station is an *"electronic-money station"*.
* The **free-out** facility (tap in and out at the same station within an hour)
  was withdrawn on **16 December 2015**; a same-station journey is now charged
  the lowest tariff, and an incorrect tap-out costs the rider the highest
  tariff.
* Some interchanges charge Rp 1,00 for a same-station pass on the connecting
  side (Batu Ceper airport side, Manggarai, Sudirman) with a 15-minute window.

### 5.3 Payment and the e-ticket rules

* **Kartu Multi Trip (KMT)** — minimum balance **Rp 5.000**
  (id.wikipedia *Kartu Multi Trip*, raw revision read:
  <https://id.wikipedia.org/w/index.php?title=Kartu_Multi_Trip&action=raw>).
  KMT is the card that also opens Transjakarta BRT, MRT Jakarta, LRT Jakarta,
  LRT Jabodebek and Trans Jogja — but each mode charges its own tariff.
* **Bank e-money**: Flazz (BCA), e-Money (Mandiri), Brizzi (BRI), TapCash (BNI),
  JakCard (Bank Jakarta), JakLingko.
* **Access by KAI** (rebranded from KAI Access on 10 August 2023) and
  **C-Access** (KAI Commuter's own app, with GoPay/OVO top-up and QR tickets).
* **GoTransit** (Gojek) QR tickets.
* **QRIS Tap** — rolled out on KRL stations from **30 October 2025** (83
  stations).
* **LinkAja** was accepted from 1 October 2019 but **stopped on 16 January 2023**.
* **JakLingko ABT** lets a rider *buy* a KRL QR ticket inside the JakLingko
  app, but — quoted from the same Wikipedia revision — *"penetapan tarif di KRL
  Commuter Line masih belum terintegrasi dan menggunakan tarif umum yang berlaku
  saat ini."* So the ticket is integrated, **the tariff is not**.
* **Mandatory ticket:** children over 3 years / over 90 cm must hold a ticket
  (2025).

---

## 6. Interchange and integration rules

### 6.1 "Integrasi Multimodal" (the JakLingko / JLI scheme) — the only live cross-mode tariff

This is the single integrated ticket that actually exists in Jakarta. It is run
by **PT Jakarta Lingko Indonesia (JLI)** with the DKI Jakarta government and is
described by JLI as a *"Program Unggulan"* of the provincial government.

| Rule | Value |
|---|---|
| Modes covered | **Transjakarta BRT (koridor haltes) + MRT Jakarta + LRT Jakarta** — 3 operators |
| Initial charge | **Rp 2.500** (boarding fee) |
| Then | **Rp 250 per kilometre** |
| **Cap** | **Rp 10.000** per integrated journey, however long the route |
| Validity window | **180 minutes (3 hours)**, counted **from the first tap-out to the last tap-out** |
| Cards that work | Mandiri e-Money, BCA Flazz, BNI TapCash, BRI Brizzi, Bank DKI JakCard, and QR tickets bought in the JakLingko transport app |
| Explicitly **excluded** | **Mikrotrans, non-BRT buses and KCI (KRL)** — and using one of them *between* the covered modes **breaks** the scheme |
| Overstay | Beyond 180 minutes the scheme ends; the last mode is recomputed at that operator's normal tariff |

**Official source (operator FAQ, read):** <https://jaklingkoindonesia.co.id/faq-tarif-integrasi>

Worked example published by JLI: *MRT Lebak Bulus → TJ Galunggung → LRT
Kelapa Gading* — normal cumulative fare **Rp 22.500**, integrated
**Rp 9.250** (a 59 % saving). The page also states that the Clearing House
recomputes the total when the rider taps out at the final gate, and that any
overpayment is returned as cashback in the JakLingko app.

Companion page: <https://jaklingkoindonesia.co.id/faq-aplikasi> — *"Kartu
Transportasi dapat digunakan di layanan MRT Jakarta, LRT Jakarta,
TransJakarta, Mikrotrans, dan KRL Commuter Line"* (the *card* works on all of
them; the *integrated tariff* does not).

> **Discrepancy in how the initial charge is described.** id.wikipedia (both
> the *Transjakarta* and the *MRT Jakarta* articles, read) says *"tarif
> awalnya adalah tarif normal moda pertama, serta tarif per kilometer moda
> berikutnya sejumlah Rp250,00"*. JLI's own FAQ says the initial charge is a
> flat **Rp 2.500 boarding fee** followed by Rp 250/km. JLI is the operator of
> the scheme, so its description is used; the Wikipedia phrasing is probably a
> loose paraphrase. A planner should **not** assume the first mode costs its
> own published tariff inside the scheme.

### 6.2 "OKOTRIP" — Transjakarta-only, and probably superseded

* id.wikipedia, *Transjakarta* § **Tarif** (read): *"Skema OKOTRIP. Pengguna
  Transjakarta dapat berpindah-pindah bus dan layanan BRT/NBRT di luar halte
  dengan membayar tarif maksimal **Rp5.000,00 dalam kurun waktu 3 jam**. Untuk
  menikmati skema ini, pengguna harus menggunakan KUE co-brand JakLingko. Kartu
  ini hanya mendukung skema tarif OKOTRIP sehingga tidak dapat menggunakan
  skema tarif integrasi multimoda."*
* **No current operator page for OKOTRIP was found.** JLI's 2026 tariff FAQ
  does not mention it. Treat OKOTRIP as **possibly superseded** by the
  multimodal scheme; `verified: false` in the JSON for that reason.

### 6.3 What is *not* integrated

| Combination | Rule |
|---|---|
| Transjakarta BRT → Transjakarta BRT (or feeder), no scheme | Two full fares (Rp 3.500 each, or Rp 2.000 if both tap-ins fall in 05:00–07:00) |
| Transjakarta BRT → non-BRT bus (Metrotrans / Minitrans) | Breaks the multimodal scheme — separate fares |
| Mikrotrans → anything | Mikrotrans is not covered; it breaks the integration |
| MRT / LRT Jakarta → KRL | **Separate tickets.** KRL is not in the scheme and its tariff is not integrated |
| LRT Jabodebek → KRL / Transjakarta / MRT / LRT Jakarta | **Separate tickets.** LRT Jabodebek is not in the scheme |
| LRT Jabodebek ↔ LRT Jakarta (Dukuh Atas) | Walking connection only, no shared ticket |
| KRL ↔ KRL (change of train / line) | Same ticket if the rider stays on the same line; a change of line means a new tap-in and a new fare |
| Royaltrans ↔ anything | Royaltrans is non-subsidised and outside every scheme; separate Rp 20.000 ticket |
| KLG holders | Free on Transjakarta, MRT and LRT Jakarta; the 15 (soon 21) eligible groups travel free |

### 6.4 Announced change: everything moves on 1 January 2027

On 30 September 2026 the Governor of DKI Jakarta announced that the
Transjakarta and Transjabodetabek tariffs — and, in a follow-on wave, the MRT,
LRT Jakarta and Mikrotrans tariffs — will be **adjusted from 1 January 2027**.
The new amounts had **not** been published as of 21 October 2026.

* Kompas, 30 September 2026, *"Tarif Transjakarta dan Transjabodetabek Naik 1
  Januari 2027: MRT, LRT hingga Mikrotrans Menyusul"* —
  <https://megapolitan.kompas.com/read/2026/09/30/17232161/tarif-transjakarta-dan-transjabodetabek-naik-1-januari-2027-mrt-lrt>
  (page fetched; the body sits behind a paywall/login wall in the text
  rendering, so the headline and the related-article links were read, not the
  full body).
* Kompas, 8 July 2026 (body read) — the proposal in numbers:
  <https://travel.kompas.com/read/2026/07/08/062718627/tarif-transjakarta-hingga-transjabodetabek-diusulkan-naik-jadi-berapa>
  — BRT and non-BRT from **Rp 3.500 → Rp 5.000**; Mikrotrans from **free →
  Rp 2.000**; Transjabodetabek to Rp 10.000.
* Also headline + RSS snippet only:
  <https://www.msn.com/id-id/berita/nasional/pramono-pastikan-tarif-transjakarta-transjabodetabek-dan-mikrotrans-naik-per-1-januari-2027/ar-AA2dgoEX>
  (Republika) and
  <https://depok.tribunnews.com/news/52641/resmi-tarif-transjakarta-mrt-dan-lrt-naik-mulai-1-januari-2027>
  ("Resmi! Tarif Transjakarta, MRT, dan LRT Naik Mulai 1 Januari 2027").

**A routing app should carry the 2026 tariffs as current and flag the
1 January 2027 change as pending, with the new amounts unknown.**

---

## 7. Summary table

| Mode | Structure | Current fare (21 Oct 2026) | Min | Max | Transfer with a bus/rail |
|---|---|---|---|---|---|
| **Transjakarta BRT** | flat, time-of-day | Rp 2.000 (05:00–07:00) / **Rp 3.500** (otherwise) | Rp 2.000 | Rp 3.500 | New tap-in = new fare; covered only by OKOTRIP (Rp 5.000 / 3 h) or the Rp 10.000 multimodal scheme |
| **Transjakarta non-BRT** (Metrotrans, Minitrans) | flat, time-of-day | Rp 2.000 / **Rp 3.500** | Rp 2.000 | Rp 3.500 | Same; **breaks** the multimodal scheme |
| **Mikrotrans** | free | **Rp 0** (proposal: Rp 2.000 from 1 Jan 2027) | Rp 0 | Rp 0 | Breaks the multimodal scheme |
| **Royaltrans** | flat, premium | **Rp 20.000** | Rp 20.000 | Rp 20.000 | Never integrated |
| **MRT Jakarta** | per station passed | **Rp 3.000 + Rp 1.000/station** | Rp 3.000 | Rp 14.000 | Only the Rp 10.000 multimodal scheme |
| **LRT Jakarta** | flat | **Rp 5.000** | Rp 5.000 | Rp 5.000 | Only the Rp 10.000 multimodal scheme |
| **LRT Jabodebek** | per km | **Rp 5.000 + Rp 700/km** | Rp 5.000 | Rp 20.000 (peak) / Rp 10.000 (off-peak) | **No integrated ticket** — separate fares |
| **KRL Jabodetabek** | per km (25 km base) | **Rp 3.000 (≤25 km) + Rp 1.000 per 10 km** | Rp 3.000 | not published | **No integrated ticket** — separate fares |

---

## 8. Unverified / unknown

| Item | Status | Why |
|---|---|---|
| **KRL maximum fare** | **Unverified** | KAI Commuter publishes a *formula*, not a cap. The fare API (`api-partner.krl.co.id/krl-webs/v1/fare`) now returns 404/401 from outside and the live site `commuterline.id` returns HTTP 503. No "tarif maksimum" figure was found on any operator or news page read. Treat as unknown, not as zero. |
| **Minitrans specific tariff** | **Unverified** | No operator tariff table for Minitrans exists on transjakarta.co.id, the Transjakarta app listing, or JakLingko's FAQ. Treated as the standard Rp 3.500 / Rp 2.000 flat fare by inference from its classification as a non-BRT feeder. |
| **OKOTRIP still being sold** | **Unverified (probably superseded)** | Only documented on id.wikipedia. JLI's current tariff FAQ does not mention it, and the JakLingko co-branded card is described there only in the context of the Rp 10.000 scheme. |
| **Transjakarta / MRT / LRT / Mikrotrans tariffs from 1 Jan 2027** | **Unknown amounts** | Announced on 30 Sep 2026; the new figures had not been published as of 21 Oct 2026. The July 2026 proposal (Rp 5.000 / Rp 2.000) is a proposal, not a decision. |
| **LRT Jabodebek ↔ KRL / Transjakarta integrated ticket** | **Does not appear to exist** | The operator's "Rute Integrasi" page only shows physical connections (published as an image whose asset is served from a private IP and could not be read). LRT Jabodebek is not among the three operators named in JLI's integration FAQ. |
| **LRT Jabodebek "distance between stations"** | **Not published** | The operator publishes a fare *matrix*, not inter-station distances, so the Rp 700/km rule cannot be re-derived from published data; the matrix is the authority. |
| **Royaltrans "Rp 20.000 – Rp 35.000"** | **Superseded** | The Rp 35.000 upper bound is a 2018 launch figure still present on id.wikipedia. The operator's current figure is Rp 20.000 flat. |
| **KRL "class" fares (KRL-B / KRL-E etc.)** | **Do not exist as separate tariffs** | All Jabodetabek KRL services are AC since 25 July 2013 and are charged one distance-based economy tariff. |
| **The exact start of the Transjakarta "ekonomi" window** | **Read as 05:00–07:00** | Both the official archived page and Wikipedia agree. Wikipedia's wording ("05.00 s.d. 07.00 … 07.00 s.d. 23.59 dan 00.01 s.d. 04.59") leaves the 00:00–00:01 minute ambiguous; it is treated as Rp 3.500. |

---

## 9. Sources that worked

**Operator / official**

* <https://transjakarta.co.id/> · `/layanan` · `/layanan/brt` · `/layanan/mikrotrans` · `/layanan/angkatan-pengumpan` · `/layanan/royaltrans>
* <https://web.archive.org/web/20161004013335/http://transjakarta.co.id/produk-dan-layanan/info-tiket/> (official Transjakarta tariff page, captured 4 Oct 2016)
* <https://jaklingkoindonesia.co.id/faq-tarif-integrasi> · <https://jaklingkoindonesia.co.id/faq-aplikasi> (PT Jakarta Lingko Indonesia)
* <https://lrtjabodebek.kai.id/informasi-tarif> · `/metode-pembayaran` · `/daftar-stasiun-lrt-jabodebek` · `/rute-integrasi` · `/faq` (KAI / LRT Jabodebek)
* <https://www.lrtjakarta.co.id/faq> (PT LRT Jakarta / Jakpro)
* <https://web.archive.org/web/2023/https://commuterline.id/informasi-publik/berita/tarif-commuterline-jabodetabek-masih-sesuai-dengan-keputusan-menteri-perhubungan-no-354-tahun-2020-kai-commuter-koordinasi-dengan-pemerintah-terkait-penyesuaian-tarif> (KAI Commuter official news)
* <https://jakartamrt.co.id/ketentuan-perjalanan> · `/layanan-pelanggan` · `/dokumen/dokumen` (PT MRT Jakarta; no tariff table on the site)
* <https://kai.id/> · `/informasi-publik` · `/layanan/angkutan-penumpang/angkutan-perkotaan/fasilitas` (PT KAI; no tariff table)
* <https://mitj.co.id/> · `/faq` · `/insight` · `/model-bisnis` (PT MITJ; no fares published)

**Wikipedia (raw revisions read)**

* <https://id.wikipedia.org/w/index.php?title=Transjakarta&action=raw>
* <https://id.wikipedia.org/w/index.php?title=Mikrotrans&action=raw>
* <https://id.wikipedia.org/w/index.php?title=MRT_Jakarta&action=raw>
* <https://id.wikipedia.org/w/index.php?title=LRT_Jakarta&action=raw>
* <https://id.wikipedia.org/w/index.php?title=LRT_Jabodebek&action=raw>
* <https://id.wikipedia.org/w/index.php?title=Daftar_tarif_LRT_Jabodebek&action=raw>
* <https://id.wikipedia.org/w/index.php?title=KRL_Commuter_Line&action=raw>
* <https://id.wikipedia.org/w/index.php?title=Kartu_Multi_Trip&action=raw>
* <https://id.wikipedia.org/w/index.php?title=Layanan_pengumpan_dalam_kota_(Transjakarta)&action=raw>

**News (article body read unless stated)**

* <https://news.detik.com/berita/d-7929030/bagaimana-cara-hitung-tarif-krl-jabodetabek-simak-infonya> — KRL fare formula
* <https://news.detik.com/berita/d-6891014/transjakarta-tarif-bus-royaltrans-tetap-rp-20-000> — Royaltrans Rp 20.000
* <https://travel.kompas.com/read/2026/07/08/062718627/tarif-transjakarta-hingga-transjabodetabek-diusulkan-naik-jadi-berapa> — 2027 proposal
* <https://megapolitan.kompas.com/read/2026/09/30/17232161/tarif-transjakarta-dan-transjabodetabek-naik-1-januari-2027-mrt-lrt> — 1 Jan 2027 announcement (headline read)
* <https://www.viva.co.id/berita/metro/1912034-jaklingko-diusulkan-tak-lagi-gratis-tarif-mikrotrans-berpotensi-naik-jadi-rp2000-per-perjalanan> — Mikrotrans proposal
* <https://megapolitan.kompas.com/read/2019/03/27/09421241/tarif-mrt-rp-3000-rp-14000-berlaku-1-april-2019> — MRT fare
* <https://www.industry.co.id/read/157195/...> — KRL fares (**contradicts the operator; not used**)
* headline + RSS snippet only: <https://finance.detik.com/infrastruktur/d-8549190/tarif-krl-dipastikan-tidak-naik> · <https://www.merdeka.com/uang/beredar-kabar-tarif-krl-bakal-naik-pt-kai-commuter-beri-jawaban-begini-196052-mvk.html> · <https://www.msn.com/id-id/berita/nasional/pramono-pastikan-tarif-transjakarta-transjabodetabek-dan-mikrotrans-naik-per-1-januari-2027/ar-AA2dgoEX> · <https://depok.tribunnews.com/news/52641/resmi-tarif-transjakarta-mrt-dan-lrt-naik-mulai-1-januari-2027>

**Sources that did not work**

* `web_search` tool — HTTP 401 (misconfigured endpoint) for every query.
* <https://www.commuterline.id/> and <https://commuterline.id/> — HTTP 503 (Akamai) on every attempt; <https://kci.id/> — Cloudflare challenge.
* <https://api-partner.krl.co.id/krl-webs/v1/fare> — the embedded JWT expired on 6 Aug 2026; the endpoint now answers 404/401.
* <https://www.jakartamrt.co.id/dokumen/dokumen> — empty; MRT publishes no fare table on its site.
* Google/Bing web search — the environment's proxy returned unrelated cached results; **Bing News RSS**
  (`https://www.bing.com/news/search?q=…&format=RSS`) and **Google News RSS** worked and were used to find the news URLs above.
