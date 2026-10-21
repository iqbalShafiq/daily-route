# Google Maps dan pemilihan rute transit — riset untuk Daily Route

**Tanggal riset:** 21 Oktober 2026 (Asia/Jakarta)
**Peneliti:** agen riset navigasi transit (sub-agent)
**Objek:** bagaimana Google Maps memilih rute transit, khususnya **halte mana yang
dipilih dari posisi pengguna**, dan bagaimana temuan itu diterjemahkan menjadi
aturan konkret untuk planner Daily Route.

---

## 0. Cara membaca dokumen ini

Setiap klaim diberi **satu dari tiga label**. Label itu tidak bisa saling
tumpang tindih; kalau sebuah kalimat butuh dua label, kalimat itu dipecah.

| Label | Arti |
| --- | --- |
| **[RESMI]** | Ada di dokumentasi resmi Google, blog resmi Google, blog Google Research, spesifikasi GTFS, atau halaman Help Center Google. Sitasi diambil persis dari sumbernya. |
| **[PERGAMBARAN]** | Hasil observasi pihak ketiga: forum, thread Help Center, tulisan/blog independen, paper yang membandingkan alat. Bukan pernyataan Google. |
| **[INFERENSI]** | Kesimpulan kita sendiri, diturunkan dari **[RESMI]** dan **[PERGAMBARAN]**. Tidak ada sumber yang menyatakannya. |

Setiap klaim juga punya **tingkat keyakinan**:

| Keyakinan | Arti |
| --- | --- |
| **Tinggi** | Sumber primer, kutipan langsung, tidak ada sumber lain yang bertentangan. |
| **Sedang** | Sumber primer tapi tidak lengkap/kontekstual, atau beberapa sumber pihak ketiga konsisten satu sama lain. |
| **Rendah** | Satu sumber pihak ketiga, atau sumber yang tidak bisa diverifikasi langsung (halaman dirender JavaScript, video yang hanya ditonton sebagian). |

### Metode dan batasannya

- Semua sumber diambil lewat **MCP Tavily** (`tavily_search`, `tavily_extract`).
  `web_search` **tidak dipakai**: di lingkungan ini `web_search` mengembalikan
  HTTP 401, sama seperti dicatat di `research/ux-map-interaction.md`.
- Halaman yang hanya dirender JavaScript atau butuh login **tidak** dipakai
  sebagai sumber angka apa pun. Yang dipakai: `developers.google.com`,
  `blog.google`, `support.google.com`, `research.google`, `mobilitydata.org`
  (GTFS), `docs.opentripplanner.org`, `eprints.whiterose.ac.uk`.
- **Yang tidak ada di internet dan tetap tidak akan dikarang:** bobot numerik
  persis yang dipakai Google di dalam router transitnya, dan angka ambang
  jarak jalan kaki maksimum milik Google. Google tidak mempublikasikan keduanya.
  Lihat §10.

---

## 1. Ringkasan eksekutif

Enam hal yang paling penting, semuanya bisa dipertanggungjawabkan:

1. **[RESMI — Tinggi]** Google Maps **tidak** memakai satu aturan tunggal
   "paling dekat". Sejak pembaruan November 2023, Google Maps
   merekomendasikan rute transit "berdasarkan faktor kunci, seperti **ETA,
   jumlah perpindahan, dan panjang perjalanan**", dan menyediakan filter
   "less walking". Ini persis tiga metrik yang sedang kita bicarakan.
   → [blog.google, Nov 2023](https://blog.google/products-and-platforms/products/maps/google-maps-updates-november-2023)

2. **[RESMI — Tinggi]** Di API, preferensi yang bisa diminta pengguna hanya
   dua: `LESS_WALKING` dan `FEWER_TRANSFERS`
   (`transitPreferences.routingPreference`). Jadi Google sendiri mengakui
   bahwa "tercepat" saja tidak cukup, dan bahwa berjalan kaki serta jumlah
   pindah adalah kriteria yang bisa ditimbang terpisah.
   → [TransitPreferences](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TransitPreferences)

3. **[RESMI — Tinggi]** How Google Maps Help menjelaskan peringkatnya:
   "The transport options we show you are ranked based on the combination of
   objective factors... These factors can include **duration, distance, price**,
   your mode preference, or the relevance of a mode to your query. Generally,
   the most important factors are your **mode preference, trip durations**, and
   sometimes **price**."
   → [support.google.com/maps/answer/144339](https://support.google.com/maps/answer/144339)

4. **[PERGAMBARAN — Sedang]** Observasi lapangan menunjukkan Google **melakukan
   trade-off antara berjalan jauh dan menunggu bus yang sebentar lagi**, dan
   pilihan itu **berubah-ubah menurut jam keberangkatan**. Buka
   [thread GraphHopper](https://discuss.graphhopper.com/t/route-suggests-walking-to-farther-bus-stop/3702):
   pada 11:31 Google menyuruh pengguna berjalan menyeberang jalan untuk
   menangkap bus yang datang sooner; pada 11:42 Google menyuruh naik bus
   dari halte tempat berdiri. Perilaku ini **tidak bisa ditiru sebagai aturan
   deterministik tanpa jadwal** — hanya dengan data GTFS.

5. **[PERGAMBARAN — Sedang]** Ada **ambang jalan kaki** milik Google, tapi
   **tidak dipublikasikan**. TravelTime (pesaing) menulis: Google punya
   "Maximum Walking Time" untuk jalan dari titik awal ke halte pertama dan dari
   halte terakhir ke tujuan, dan sering mengembalikan hasil yang **melebihi**
   batas 15 menit mereka. Pengamat lain (America Walks) menulis hal yang sama
   lebih tegas: aplikasi peta punya batas jalan kaki *built-in* yang
   "not disclosed", dan halte di luar batas itu **tidak ditampilkan sama
   sekali**.
   → [TravelTime KB](https://help.traveltime.com/en/articles/8524070-how-the-transport-models-compare-to-google-maps),
   [America Walks](https://americawalks.org/hacking-the-map-apps-for-active-transportation-less-walking-vs-more-walking-as-a-means-of-optimized-movement-and-mobility)

6. **[RESMI — Tinggi + PERGAMBARAN — Tinggi]** Struktur pencarian yang
   dipakai industri — *access* (jalan kaki dari titik asal ke halte),
   *transit* (naik kendaraan), *egress* (jalan kaki dari halte ke tujuan) —
   adalah cara OpenTripPlanner memisahkan pekerjaannya, dan access/egress-nya
   **mencari banyak kandidat halte**, bukan satu. Output Google menunjukkan
   struktur yang sama: langkah jalan kaki dan langkah transit berada pada
   level `legs[].steps[]` yang sama, sehingga "jalan kaki ke halte" adalah
   bagian dari pencarian, bukan langkah terpisah. **Catatan jujur:** pemisahan
   access/transit/egress itu **dokumentasi OpenTripPlanner, bukan Google** —
   Google hanya menunjukkan strukturnya lewat output. Ini mendukung perubahan
   yang kita rencanakan.

**Kesimpulan untuk Daily Route:** pilihan halte asal **tidak boleh** ditentukan
oleh jarak terdekat. Ia harus ditentukan oleh **perjalanan door-to-door** yang
dihitung utuh untuk setiap kandidat, dan **batas jarak jalan kaki harus
eksplisit dan bisa ditampilkan ke pengguna**, bukan tersembunyi.

---

## 2. Tabel algoritma yang dijelaskan

| Sistem | Algoritma inti | Sumber | Bagaimana origin dipilih | Bobot yang bisa diatur pengguna |
| --- | --- | --- | --- | --- |
| **Google Maps** (produk) | **Transfer Patterns**; Scalable Transfer Patterns; Frequency-Based Search | **[RESMI — Tinggi]** [Google Research, 2 Mar 2016](https://research.google/blog/an-update-on-fast-transit-routing-with-transfer-patterns) | **Tidak dipublikasikan.** Routing dilakukan sebagai satu pencarian utuh; access walk (titik asal → halte) adalah bagian dari pencarian, bukan langkah terpisah | UI: filter "less walking" + tipe transit. API: `LESS_WALKING`, `FEWER_TRANSFERS` |
| **Google Maps Platform — Routes API** | Engine yang sama dengan produk (Google memakai API ini di dalam aplikasinya) | **[RESMI — Tinggi]** [Get a transit route](https://developers.google.com/maps/documentation/routes/transit-route) | Sama | `transitPreferences.routingPreference`: `LESS_WALKING` \| `FEWER_TRANSFERS`; `allowedTravelModes`: `BUS`/`SUBWAY`/`TRAIN`/`LIGHT_RAIL`/`RAIL` |
| **Google Maps Platform — Directions API (Legacy)** | — | **[RESMI — Tinggi]** [Distance Matrix API (Legacy)](https://developers.google.com/maps/documentation/distance-matrix/distance-matrix) | Sama | `transit_routing_preference=less_walking\|fewer_transfers` |
| **OpenTripPlanner 2** | **RAPTOR / Range Raptor / McRAPTOR** (Delling, Katz, Pajor, 2012) | **[PERGAMBARAN — Tinggi]** [OTP2 Bibliography](https://docs.opentripplanner.org/en/latest/Bibliography), [RAPTOR paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf) | **Access search** ke banyak kandidat halte; `maxDuration` (default `PT45M`), `maxStopCount` 500, `penalty` per mode jalan | `routingDefaults.accessEgress.maxDuration`, `penalty`, `transitGeneralizedCostLimit` |
| **GraphHopper** | Time-dependent A*/Dijkstra | **[PERGAMBARAN — Tinggi]** [GraphHopper forum](https://discuss.graphhopper.com/t/route-suggests-walking-to-farther-bus-stop/3702) | Multi-kandidat stop, tapi default = **arrival paling awal**; jalan kaki hanya *tie-breaker* | `beta_walk_time` (default **1.0**) — bobot relatif jalan kaki terhadap naik kendaraan |
| **Citymapper** | Tidak dipublikasikan | **[PERGAMBARAN — Rendah]** [Wikipedia](https://en.wikipedia.org/wiki/Citymapper) | — | "least transfers", "least walking" |
| **Moovit** | Tidak dipublikasikan | **[PERGAMBARAN — Rendah]** [perbandingan Citymapper–Moovit](https://whatitallboilsdownto.wordpress.com/2016/10/07/moovit-vs-citymapper-making-public-transportation-easy) | — | "least walking", "least transfers" |
| **Transit app** | Tidak dipublikasikan | **[PERGAMBARAN — Sedang]** [GraphHopper forum](https://discuss.graphhopper.com/t/route-suggests-walking-to-farther-bus-stop/3702) | Forum mencatat: Transit app **secara bawaan** memilih rute yang lebih baik dalam kasus yang sama | — |

> **Catatan.** Baris Google Maps di tabel ini sengaja tidak diberi nama
> algoritma yang lebih spesifik. Yang bisa diverifikasi adalah *Transfer
> Patterns* dan turunannya (dari Google Research). **Nama algoritma produksi
> yang sedang berjalan di Google Maps hari ini tidak dipublikasikan**, dan
> kita tidak mengarangnya. GraphHopper, RAPTOR, dan transfer patterns adalah
> **algoritma yang berbeda**; kesamaannya bersifat konseptual (access + transit
> + egress, multi-kriteria), bukan identitas implementasi.

---

## 3. Q1 — Strategi pilihan origin di Google Maps

### 3.1 Apakah Google benar-benar mengevaluasi beberapa halte?

**Jawaban: ya, dengan bukti kuat — tetapi Google tidak mempublikasikan
mekanismenya secara terperinci.**

- **[RESMI — Tinggi]** Google Maps memakai **Transfer Patterns** untuk
  routing transit sejak 2010,(created oleh Hannah Bast bersama sejumlah
  insinyur Google di kantor Zurich), lalu dilanjutkan dengan *Scalable
  Transfer Patterns* dan *Frequency-Based Search* untuk jaringan berskala
  benua. Kutipan: *"The technique behind that speed-up is the Transfer Patterns
  algorithm, which was created at Google's engineering office in Zurich,
  Switzerland, by visiting researcher Hannah Bast and a number of Google
  engineers."* Sumber:
  [research.google/blog/an-update-on-fast-transit-routing-with-transfer-patterns](https://research.google/blog/an-update-on-fast-transit-routing-with-transfer-patterns)
  (2 Maret 2016, Arno Eigenwillig, Software Engineer on Google Maps
  Directions).

- **[RESMI — Tinggi]** Prinsip kerja *transfer patterns* adalah bahwa
  **pola perpindahan dihitung di muka**, dan pencarian cukup memilih sebagian
  kecil pola tersebut.
  memilih subset pola tersebut. Ini secara struktural mengimplikasikan bahwa
  **bukan hanya satu halte** yang dipertimbangkan dari titik asal — kalau
  hanya satu, tidak ada pola yang perlu disimpan di muka.

- **[RESMI — Tinggi]** API Google menampilkan **perjalanan sebagai satu
  kesatuan**: `legs[].steps[]` berisi langkah jalan kaki menuju halte
  (`Walk to …`), langkah transit (`transitDetails` berisi
  `departureStop`/`arrivalStop`, `arrivalTime`/`departureTime`, `headsign`,
  `stopCount`), lalu langkah jalan kaki lagi. Sumber:
  [Get a transit route](https://developers.google.com/maps/documentation/routes/transit-route).
  **[INFERENSI — Tinggi]** Struktur ini hanya bisa dihasilkan jika planner
  memilih **halte keberangkatan dan halte tujuan sekaligus**;
  kalau origin dipatok ke halte terdekat, `departureStop` akan selalu
  berjarak minimum dan tidak akan pernah ada trade-off yang terlihat.

- **[PERGAMBARAN — Sedang]** Observasi independen menunjukkan Google
  **benar-benar** berjalan lebih jauh untuk_strategy yang lebih baik:
  - GraphHopper forum: pada 11:31 Google menyuruh pengguna
    "walk across the street to catch the soonest bus"; pada 11:42 Google
    memilih bus yang datang ke halte tempat berdiri. Jadi halte asal **tidak** kaku.
  - Reddit (2025): *"It will tell me to take a bus to a subway that is a 30
    minute walk and taking the bus to the subway is ten minutes slower than
    walking to the …"* — Ilustrasi bahwa durasi total, bukan jarak
    terdekat, yang dipakai.

- **[PERGAMBARAN — Rendah]** Deskripsi teknis pihak ketiga tentang "Google
  Maps transit routing" di blog dan substack sering menyebut RAPTOR,
  Dijkstra, atau "nearest stops". Ini **tidak** cocok dengan sumber resmi
  Google (yang menyebut Transfer Patterns) dan tidak boleh dipakai sebagai
  fakta. Saya tandai **tidak terverifikasi**.

### 3.2 Bagaimana Google memberi peringkat alternatif rute transit?

**Pembaruan resmi November 2023 — ini sumber kunci kita.**

**[RESMI — Tinggi]** Dari blog resmi Google Maps, 9 November 2023:

> "we're now updating our transit directions so you can easily see the best
> route to your destination based on key factors, like **ETA, number of
> transfers and the length of your trip**. You can even customize your route
> with handy filters that let you select what type of transit you want to take,
> or if you want a route with less walking."

Sumber: [blog.google — 8 Google Maps tips to help you navigate the holidays](https://blog.google/products-and-platforms/products/maps/google-maps-updates-november-2023)

Konsekuensi yang bisa kita pakai:

1. Google **memperlakukan tiga hal sebagai faktor berjenjang**: ETA, jumlah
   perpindahan, panjang perjalanan. "Panjang perjalanan" di sini berarti
   durasi, bukan kilometer.
2. "Less walking" adalah **filter**, bukan default. Artinya: **default Google
   mengorbankan jalan kaki demi waktu** — persis kebalikan dari halte
   terdekat, dan justru dekat dengan yang kita mau.
3. Google **tidak** menyediakan prefensi "lebih sedikit jalan kaki tetapi
   lebih lambat". Hanya dua arah: `LESS_WALKING` dan `FEWER_TRANSFERS`.

**[RESMI — Tinggi]** Di level API, preferensi yang tersedia persis dua
( enum `TransitRoutingPreference`):

| Nilai | Arti (kutipan) |
| --- | --- |
| `TRANSIT_ROUTING_PREFERENCE_UNSPECIFIED` | "No preference specified." |
| `LESS_WALKING` | "Indicates that the calculated route should prefer limited amounts of walking." |
| `FEWER_TRANSFERS` | "Indicates that the calculated route should prefer a limited number of transfers." |

Sumber: [TransitPreferences](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TransitPreferences)

Catatan penting **[RESMI — Tinggi]**: di API lama, `transit_routing_preference`
didefinisikan sebagai **bias terhadap opsi yang dikembalikan**, bukan
sebagai pilihan mutually exclusive:

> "Specifies preferences for transit routes. Using this parameter, you can
> **bias the options returned**, rather than accepting the default best route
> chosen by the API."

Sumber: [Distance Matrix API (Legacy)](https://developers.google.com/maps/documentation/distance-matrix/distance-matrix)

**[INFERENSI — Tinggi]** Karena `LESS_WALKING` bekerja sebagai *bias* (bukan
*pemilih*), secara teknis yang paling dekat dengan implementasi Google adalah
**biaya terikat (bounded cost)**: jalan kaki diberi bobot lebih tinggi dalam
skor, bukan Verteilt sebagai filter pasif.

### 3.3 Apakah "your location" juga diperlakukan sebagai kandidat halte?

**[RESMI — Tinggi]** Petunjuk resmi: "Not all cities have public transit
directions in Google Maps. **Before you can get transit directions, your local
transit agency must add their route info to Google Maps.**"
([support.google.com/maps/answer/144339](https://support.google.com/maps/answer/144339))

**[RESMI — Tinggi]** Sumber data transit Google adalah **GTFS** — format
yang memuat `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`,
`shapes.txt`, `calendar.txt`. Otoritas atau operator bus
mempublikasikan feed-nya; Google memprosesnya.
([developers.google.com/transit/gtfs](https://developers.google.com/transit/gtfs))

**[INFERENSI — Tinggi]** Karena `stops.txt` berisi banyak halte dan
`stop_times.txt` mengikat perjalanan ke halte tertentu, dan karena transfer
patterns dihitung di muka untuk **pasangan halte**, origin dari koordinat
kaku **pasti** dipetakan ke satu atau lebih halte kandidat lebih dulu.

---

## 4. Q2 — Metrik dan bobot

### 4.1 Metrik apa yang dipakai?

**[RESMI — Tinggi]** Dua sumber resmi, dua tingkat:

**Tingkat produk (Help Center):**

> "The transport options we show you are ranked based on the combination of
> objective factors designed to help you find relevant and useful info. These
> factors can include **duration, distance, price, your mode preference**, or
> the relevance of a mode to your query. Generally, the most important factors
> are your **mode preference, trip durations, and sometimes price**."

Sumber: [Get directions & show routes in Google Maps](https://support.google.com/maps/answer/144339?hl=en&co=GENIE.Platform%3DDesktop)
(versi Android dan Desktop identik dalam hal ini)

**Tingkat API (TransitPreferences):** `LESS_WALKING` dan `FEWER_TRANSFERS`.

**[RESMI — Tinggi]** Legasi API memperinci satu parameter lagi:
`allowedTravelModes` / `transit_mode` — `BUS`, `SUBWAY`, `TRAIN`,
`LIGHT_RAIL`, `RAIL`. Ini memengaruhi **mode** mana yang boleh dipakai, bukan
bobot.

### 4.2 Apakah ada preferensi "fewer transfers" di samping "fastest"?

**Ya.**-location sudah dijelaskan di §3.2. Yang belum jelas: **apakah Google
memberi "fewer transfers" bobot yang sama dengan "less walking"** — tidak
dipublikasikan.

- **[INFERENSI — Sedang]** Karena API menawarkan *dua* enum terpisah dan bukan satu
  bobot tunggal, kemungkinan ada **dua profil biaya** (satu untuk
  "less walking", satu untuk "fewer transfers") daripada satu bobot
  skalar. Tapi ini **tidak terverifikasi**.

### 4.3 Bagaimana Google menangani "walking too far to a stop"?

**Ini bagian paling lemah buktinya, jadi saya pisahkan dengan tegas.**

**[PERGAMBARAN — Sedang]** TravelTime Knowledge Base, "How the transport
models compare to Google Maps":

> "**Maximum Walking Time** - the time allowed to walk from the origin to the
> first public transport stop/station and from the final stop/station to the
> destination. Often Google will return a result that requires more than the
> default Maximum Walking Time for the TravelTime API (15 minutes)"

Sumber: [help.traveltime.com](https://help.traveltime.com/en/articles/8524070-how-the-transport-models-compare-to-google-maps)

**[PERGAMBARAN — Sedang]** America Walks, "Hacking the Map Apps":

> "The apps have a built-in set amount—**not disclosed**—they feel is
> reasonable for the average person to walk and plan the route accordingly.
> Busses and trains within this limit are shown, those beyond are not. The
> user can choose to walk less than this, but not to walk more."

Sumber: [americawalks.org](https://americawalks.org/hacking-the-map-apps-for-active-transportation-less-walking-vs-more-walking-as-a-means-of-optimized-movement-and-mobility)

**[PERGAMBARAN — Tinggi]** Paper terperindeks yang mengukur perilaku Google
Maps diBeijing (J. Haitao dkk., *Measuring Public Transit Accessibility Based
On Google Direction API*, Open Transportation Journal, 2019):

> "Google Map gives the direction information showing that transit riders need
> to walk about **450 m** to a transit access point before making a southward
> transit."
>
> "The feedback script shows the first step is a walking length of **461
> meters** to a metro station."

Sumber: [opentransportationjournal.com VOLUME/13/PAGE/93](https://opentransportationjournal.com/VOLUME/13/PAGE/93/FULLTEXT)

**[INFERENSI — Sedang]** Angka 450–461 m di Beijing **tidak** bisa
dipindahkan ke Jakarta. Namun ini menunjukkan **skala** yang masuk akal:
ratusan meter, bukan 50 m dan bukan 2 km.

**Angka yang sering dipakai orang (500 m, 1 km) ternyata TIDAK berasal dari
Google.** Yang benar-benar Support:

| Angka | Asal | Status |
| --- | --- | --- |
| 400 m / 500 m | Standar **perencanaan** (bukan Google): Canberra 400→500 m; rekomendasi jarak antarhalte 500 m | **[PERGAMBARAN — Tinggi]** [Human Transit](https://humantransit.org/2011/04/basics-walking-distance-to-transit.html) |
| 0,25–0,5 mil (400–800 m) | Preferensi **penumpang** dari survei Jerman 2020 | **[PERGAMBARAN — Sedang]** [Via](https://ridewithvia.com/resources/long-walking-distance-prevents-people-from-using-transit-heres-how-to-change-that) |
| 328–520 m (rata-rata) | **Data empiris** perjalanan jalan kaki menuju halte di beberapa kota | **[PERGAMBARAN — Tinggi]** [Tennøy dkk., 2022, *Journal of Transport Geography*](https://www.sciencedirect.com/science/article/pii/S1361920922000013) |
| ~450–460 m | **Google Maps di Beijing**, hasil probing API | **[PERGAMBARAN — Tinggi]** [Haitao dkk. 2019](https://opentransportationjournal.com/VOLUME/13/PAGE/93/FULLTEXT) |
| 15 menit | **TravelTime** (bukan Google), dan Google sering melampauinya | **[PERGAMBARAN — Sedang]** [TravelTime KB](https://help.traveltime.com/en/articles/8524070-how-the-transport-models-compare-to-google-maps) |

**Kesimpulan:** angka "500 m–1 km" yang beredar adalah **inverkehrtegnik
perencanaan**, bukan parameter Google. Untuk Daily Route kita **tidak boleh**
mengutip angka itu sebagai "aturan Google". Kalau kita memakai angka, itu
harus ditandai sebagai **kebijakan tim** yang diberi alasan.

### 4.4 Argumen industri yang mendukung "biaya, bukan batas keras"

Ini argumen yang paling berguna untuk produk kita, dan datang dari sumber
teknis resmi OpenTripPlanner:

**[PERGAMBARAN — Tinggi]** Maintainer OTP, issue #967:

> "we identified that **it is incorrect to apply any hard limit to any variable
> unless that variable is also an optimization objective** (cf. 'resource
> limiting problem' in operations research literature). It is however
> acceptable to filter out individual edges or mask of whole sections of the
> graph, which is equivalent to just changing the contents of the graph before
> routing."

Sumber: [OpenTripPlanner #967](https://github.com/opentripplanner/OpenTripPlanner/issues/967)

**[INFERENSI — Tinggi]** Ini argumen yang sama persis berlaku untuk
Daily Route: **jangan memotong kandidat halte dengan radius**. Beri jalan kaki
bobot, lalu potong hanya kalau tidak ada hasil sama sekali — dan **katakan
kepada pengguna** kalau batas itu ditegakkan.

---

## 5. Q3 — Waktu tunggu dan jadwal

### 5.1 Apakah durasi perjalanan menyertakan waktu tunggu?

**Ya, dan ini terverifikasi dari skema respons resmi.**

**[RESMI — Tinggi]** Di Routes API, setiap langkah transit punya
`transitDetails` dengan `arrivalTime` dan `departureTime` yang **eksplisit**:

```json
"transitDetails": {
  "stopDetails": {
    "arrivalStop":  { "name": "Saldanha",   "location": { ... } },
    "arrivalTime":  "2023-08-26T10:49:42Z",
    "departureStop":{ "name": "Aeroporto",  "location": { ... } },
    "departureTime":"2023-08-26T10:32:10Z"
  },
  "headsign": "São Sebastião",
  "stopCount": 4
}
```

Sumber: [Get a transit route](https://developers.google.com/maps/documentation/routes/transit-route)

**[INFERENSI — Tinggi]** Karena waktu *tiba di halte* dan waktu *berangkat dari
halte* keduanya ada dan berbeda, **waktu tunggu adalah bagian dari durasi
perjalanan**. Rutut yang dijumlahkan Google adalah:

```
total = Σ (jalan kaki ke halte pertama)
      + Σ (tunggu kendaraan)
      + Σ (waktu naik kendaraan)
      + Σ (jalan kaki transfer)
      + (jalan kaki dari halte terakhir ke tujuan)
```

**Perhatikan:** ini persis rumus yang sudah dipakai Daily Route
(`packages/transit/src/graph.ts`: `AVERAGE_WAIT_MINUTES` per mode +
`transferPenaltyMinutes`), kecuali satu hal penting:

**[RESMI — Tinggi]** `departureTime` / `arrivalTime` bisa diisi, dan
Google menjadwalkan perjalanan **berdasarkan jadwal**:

> "`arrivalTime` … NOTE: This field is ignored when requests specify a
> `RouteTravelMode` other than `TRANSIT`. You can specify either
> `departureTime` or `arrivalTime`, but not both. **Transit trips are
> available for up to 7 days in the past or 100 days in the future.**"

Sumber: [computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)

> "To find the best route based on estimated traffic and **transit schedules**,
> change your travel date or time."

Sumber: [support.google.com/maps/answer/144339](https://support.google.com/maps/answer/144339)

### 5.2 Apakah GTFS dipakai, dan apakah ada real-time?

**Ya, keduanya, dan ini resmi.**

**[RESMI — Tinggi]** Data statis: GTFS Static. *"Agencies can share their
feeds publicly via a web server or submit them to Google for inclusion in
Google Maps."* — [developers.google.com/transit/gtfs](https://developers.google.com/transit/gtfs)

**[RESMI — Tinggi]** Data real-time: GTFS Realtime, dipakai oleh fitur
"Live Transit Updates" yang memberikan *live departure times* dan *service
alerts*:

> "Live Transit Updates is a service providing real-time transit updates to
> users of Google Maps and Google Maps for mobile. These updates include live
> departure and arrival times to transit stations and service alerts."

Sumber: [developers.google.com/transit/gtfs-realtime](https://developers.google.com/transit/gtfs-realtime)

**[RESMI — Tinggi]** Frekuensi ingestion:

> "GTFS Realtime feeds are either **periodically fetched by Google (typically
> every 30 seconds)**, or programmatically pushed by a transit agency when
> something changes."

Sumber: [support.google.com/transitpartners/answer/6368391](https://support.google.com/transitpartners/answer/6368391)

**[RESMI — Tinggi]** Google's *validator* GTFS adalah validator yang dipakai
oleh MobilityData (kepemiliknya standar GTFS) — Cal-ITP memakai validator yang
sama untuk laporan kualitas bulanan tiap operator di California.
([reports.dds.dot.ca.gov](https://reports.dds.dot.ca.gov))

### 5.3 Trade-off "jalan kaki 3 menit lagi" vs "tunggu bus 8 menit"

**[PERGAMBARAN — Sedang]** Thread GraphHopper adalah observasi paling gamblang
yang saya temukan. Ringkasnya:

| Waktu berangkat | Yang Choice Google | Penafsiran |
| --- | --- | --- |
| 11:31 | Berjalan menyeberang jalan untuk menangkap bus yang sooner | Google **mengorbankan jalan kaki** demi waktu |
| 11:42 | Naik bus dari halte tempat berdiri | Berbeda bus, **hasil berbeda** dengan preferensi yang sama |

Kutipan: *"Google Maps also does returns results like these, but just some of
the time. For Friday's at 11:31 AM depart time, both Google and Ithaca
Transit give the same result. They identify it's quickest to walk across the
street to catch the soonest bus in the area. However, at 11:42 AM departure
time, Google uses the bus that comes to South Hill Business Park."*

Sumber: [discuss.graphhopper.com](https://discuss.graphhopper.com/t/route-suggests-walking-to-farther-bus-stop/3702)

**[INFERENSI — Tinggi]** Ini **tidak bisa** direplikasi tanpa data jadwal.
Dan sebabnya begini: pada 11:31, bus di halte seberang datang *sebelum* bus di halte
berdiri — sehingga berjalan 3 menit menang. Pada 11:42, bus di halte berdiri
datang lebih dulu — sehingga berjalan 3 menit kalah. **Perilaku Google di sini
adalah perilaku yang benar** dan justru menjadi bukti bahwa Google
memperhitungkan **waktu tunggu sebenarnya**, bukan headway rata-rata.

**Konsekuensi untuk Daily Route:** planar kami sekarang memakai
`AVERAGE_WAIT_MINUTES` (bus 5, minibus 4, tram 6, metro 3, rail 6 menit).
Itu **rata-rata**, dan karena itu **tidak bisa membedakan dua kandidat halte
yang dilayani bus berbeda**. Selama belum ada GTFS, ini adalah keterbatasan
yang harus dinyatakan terang-terangan di UI ("estimasi waktu tunggu
menggunakan headway rata-rata operator, bukan jadwal").

### 5.4 Apakah durasi Google terlalu optimis?

**[PERGAMBARAN — Sedang]** Dua indikasi:

1. Tutorial pihak ketiga (CAD in black, Okt 2025) mencatat bahwa Google
   **tidak** menambahkan buffer di halte dan **tidak** memperhitungkan lampu
   merah saat berjalan, sehingga rekomendasi "berangkat pukul 08:07"
   sebaiknya ditunda 5–10 menit.
   ([youtube.com/watch?v=lU_lDLEA_-A](https://www.youtube.com/watch?v=lU_lDLEA_-A))
2. Paper pembanding: J. Lahoorpoor & D. Levinson (2020), *The Transit Travel
   Time Machine*, membandingkan ArcGIS Network Analyst, OpenTripPlanner, dan
   **Google Maps API** pada 30 stasiun Sydney Trains. Hasil: *"OpenTripPlanner
   produces **higher** transit travel times than Google Maps API (**2.8
   minutes**)"* — Google **lebih optimis** sekitar 2,8 menit dibanding OTP.
   ([transportist.org](https://transportist.org/2019/11/19/the-transit-travel-time-machine-comparing-three-different-tools-for-travel-time-estimation),
   [paper](https://www.researchgate.net/publication/342080401_The_Transit_Travel_Time_Machine_Comparing_Three_Different_Tools_for_Travel_Time_Estimation))

**[PERGAMBARAN — Rendah]** Level 12 (blog) mencatat isochrone Google untuk
transit **lebih besar** daripada TravelTime, yang mereka tafsirkan sebagai
Google lebih optimis. Arah ini konsisten, tapi metodologi mereka berbeda dan
bukan settiga.

---

## 6. Q4 — Multimodal dan re-walk

### 6.1 Perpindahan antar mode

**[RESMI — Tinggi]** Google Maps sejak 2019 memasangkan transit dengan
**cycling** dan **ridesharing**:

> "All of this information is automatically factored into your **total travel
> time and ETA** so you can know exactly when you'll get to your destination."

Sumber: [blog.google — Travel your first and last mile with Google Maps](https://blog.google/products-and-platforms/products/maps/travel-your-first-and-last-mile-google-maps)
(27 Agustus 2019, Vishal Dutta, Product Manager, Google Maps)

**[RESMI — Tinggi]** Pembaruan yang lebih baru (2024) memperluas gambaran itu:

> "Soon, you'll get a comprehensive view of all routes and transportation modes
> available to your destination — you can compare how long it'll take to get
> there by car, transit or bike without toggling between tabs. Using advanced
> machine learning models, Maps will automatically prioritize your preferred
> modes — and even boost modes that are popular in your city."

Sumber: [blog.google — Redefining what a map can be with new information and AI](https://blog.google/products-and-platforms/products/maps/redefining-what-map-can-be-new-information-and-ai)

**[RESMI — Tinggi]** Transit di Routes API **tidak mendukung waypoint
tengah**, tidak bisa eco-friendly, tidak bisa mengatur traffic data, dan
**hanya boleh memakai `transitPreferences`** untuk `routingPreference`.
([Get a transit route](https://developers.google.com/maps/documentation/routes/transit-route))

### 6.2 "Re-walk" / "walk via a different stop"

**[INFERENSI — Tinggi]** Secara konsep, "re-walk" **hanya mungkin** kalau
access/egress adalah bagian dari pencarian yang sama dengan transit — dan
itulah yang Google lakukan (Transfer Patterns), dan yang OTP-II lakukan
secara eksplisit:

**[PERGAMBARAN — Tinggi]** OTP2:

> "OTP2 splits the search into three segments: **access** from the origin to
> transit stops, **egress** from transit stops to the destination, and
> **transit service** connecting the two."

Sumber: [docs.opentripplanner.org Bibliography](https://docs.opentripplanner.org/en/latest/Bibliography)

> "…Additionally, these algorithms have been extended using multilevel
> partitioning … These improvements make them more practical for solving
> **location-based queries (as a location can have multiple stops near it)**."

Sumber: [transnetlab/transit-routing](https://github.com/transnetlab/transit-routing)

**[RESMI — Tinggi]** Dokumentasi Routes API juga mengonfirmasi bahwa
**langkah jalan kaki dan langkah transit berada pada level yang sama** —
`legs[].steps[]` — sehingga optimasi "jalan kaki lewat halte lain" akan
menjadi artefak alami dari satu pencarian.

**Tidak terverifikasi:** apakah Google secara internal menjalankan pencarian
access terpisah (access search) seperti OTP, atau menyatukannya dalam satu
graf waktu-tergantung. **Google tidak mempublikasikan ini.** Kita hanya tahu
hasilnya: pilihan halte berubah menurut waktu keberangkatan (§5.3).

---

## 7. Q5 — Pattern UI

### 7.1 Bagaimana "walking to your stop" ditampilkan

**[RESMI — Tinggi]** Di API, jalan kaki ke halte adalah **step biasa**
di dalam `legs[].steps[]`, dengan `travelMode: WALK`, `polyline` sendiri, dan
`startLocation`/`endLocation`. Setiap langkah transit berikutnya menyebut
`departureStop` — sehingga pengguna melihat *nama halte* yang dipilih.

Sumber: [Get a transit route](https://developers.google.com/maps/documentation/routes/transit-route)
(field mask `routes.legs.steps.polyline`, `routes.legs.steps.travelMode`,
`routes.legs.steps.startLocation`)

**[PERGAMBARAN — Sedang]** Di aplikasi, segmen jalan kaki digambar sebagai
**garis abu-abu putus-putus** (dashed grey), dengan panah arah; segmen transit
digambar berwarna operator. Bukti: [<i>How to Fix Google Maps' Grey Dashed
Line Problem For Walking Navigation</i>](https://support.google.com/maps/thread/225630424/how-to-fix-google-maps%E2%80%99-grey-dashed-line-problem-for-walking-navigation?hl=en)
(thread Help Center, judul thread menyebut "grey dashed line" untuk
walking), dan screenshot di [Google Maps: How to Read Walking + Bus Trips
Correctly](https://www.youtube.com/watch?v=lU_lDLEA_-A) yang menunjukkan
polyline abu-abu putus-putus untuk kaki dan warnasolid untuk bus.

**[PERGAMBARAN — Sedang]** Google juga menampilkan sisi jalan halte: *"you can
see exactly which side of the street the stop is located"* (tutorial video
yang sama), dan sejak 2023 menampilkan **entrance/exit, sisi jalan, dan rute
jalan kaki ke/dari stasiun** di 80+ kota.

### 7.2 Bagaimana alternatif ditampilkan

**[RESMI — Tinggi]** Official:

- *"If there are multiple routes, the **best route to your destination is
  blue. All other routes are gray.**"*
  ([support.google.com/maps/answer/144339](https://support.google.com/maps/answer/144339))
- *"you can easily see the best route to your destination based on key factors,
  like ETA, number of transfers and the length of your trip. You can even
  customize your route with handy filters that let you select what type of
  transit you want to take, or if you want a route with less walking."*
  ([blog.google, Nov 2023](https://blog.google/products-and-platforms/products/maps/google-maps-updates-november-2023))
- Di API: `computeAlternativeRoutes: true` → **hingga 3 rute tambahan**.
  ([computeRoutes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes))

**[PERGAMBARAN — Sedang]** Chip yang terlihat di UI aplikasi (desktop/mobile):
**Best route / Fewest transfers / Least walking / Wheelchair accessible /
Lowest cost**. Sumber: [HowToGeek, "4 Google Maps features that make public
transit less confusing"](https://www.howtogeek.com/google-maps-features-that-make-public-transit-less-confusing),
dan thread Reddit [r/GoogleMaps](https://www.reddit.com/r/GoogleMaps/comments/1cyiu12/confusing_routes)
yang menyebut chip yang sama. Ini **tidak** dikonfirmasi dokumentasi resmi
per-chip, jadi statusnya PergAMBaran.

**[RESMI — Tinggi]** Konsekuensi untuk Daily Route: Google **menyediakan
alternatif berdampingan**, bukan satu jawaban. Itu cocok dengan AGENTS.md
("The planner judges a journey on time, distance and the number of changes
together… The best route is the one with the lowest cost") — tetapi juga
membawa kewajiban untuk **menampilkan** alternatif itu, bukan cuma menyimpan.

---

## 8. Q6 — Studi kasus Jakarta

### 8.1 "Mind the Gap" — Bastarianto dkk. (2025)

**Ini studi kasus Jakarta paling relevan yang saya temukan.**

**Sitasi:** Bastarianto, F. F.; Hancock, T. O.; Ilahi, A.; Manley, E.;
Choudhury, C. F. (2025). *'Mind the Gap' — The impact of discrepancies between
Google Maps API and reported travel data in the Global South*. **Case Studies
on Transport Policy**, 21, 101508. DOI: 10.1016/j.cstp.2025.101508.

**Metode:** data survei diario perjalanan (travel diary survey) di **Greater
Jakarta**, dibandingkan dengan nilai yang dihasilkan **Google Maps API**.

**Temuan (kutipan dari paper):**

> "The findings indicate that there are **clear discrepancies between Google
> Maps API travel times and costs** and the respondents' reported travel times
> and costs in the context of Greater Jakarta. The disparities between travel
> time and cost of travel **vary systematically across travel modes**.
> **Reported times were significantly less than those provided by the Google
> Maps API for certain road-based public transportation.** The Google Maps
> API, however, **underestimated times for private vehicles**. Concerning
> travel costs, reported costs were somewhat greater than those estimated by
> Google Maps API."

> "Therefore, transport planning tools that use Google Maps API data in any
> form should acknowledge that such systematic variations can lead to
> inaccuracies in predictions…"

Sumber: [eprints.whiterose.ac.uk — PDF](https://eprints.whiterose.ac.uk/id/eprint/228392/1/1-s2.0-S2213624X25001452-main.pdf)
| [record White Rose](https://eprints.whiterose.ac.uk/id/eprint/228392)
| [TRID](https://trid.trb.org/View/2564417)
| [Google Scholar](https://scholar.google.com/scholar_lookup?title=%27Mind+the+Gap%27%E2%80%94The+impact+of+discrepancies+between+Google+Maps+API+and+reported+travel+data+in+the+Global+South&publication_year=2025&doi=10.1016%2Fj.cstp.2025.101508)

**Membaca temuan ini untuk Daily Route (bagian penting):**

1. Untuk **transit berbasis jalan** di Jakarta, Google Maps **meng excesivo
   waktu tempuh** dibanding yang dirasakan penumpang. Ini konsisten dengan
   temuan Sydney (§5.4) bahwa Google ~2,8 menit lebih optimis dari OTP, dan
   dengan temuan bahwa Google tidak menambah buffer di halte.
2. Untuk **kendaraan pribadi**, Google justru **meng-underestimate**.
3. **Implikasi**: kalau Daily Route meniru Google dengan optimistic, ia akan
   **sistematis terlalu optimis di Jakarta**. Kita perlu **buffer di halte**
   (tidak hanya headway rata-rata), dan harus menampilkan estimasi sebagai
   estimasi.

### 8.2 Transjakarta sudah mengunggah GTFS ke Google Maps

**[RESMI — Tinggi]** Sumber primer: **situs resmi Transjakarta**,
11 Juli 2024:

> "Transjakarta and Google present real-time information on Transjakarta
> buses on Google Maps. This new information allows users to track their bus
> location in real time, making it easier to plan trips and avoid delays."

> "Starting today, users can access real-time Transjakarta bus data directly
> via Google Maps on smartphones and other devices. If a Transjakarta route is
> available, real-time information will be displayed clearly in the search
> results."

Sumber: [transjakarta.co.id — Real-Time Transjakarta Information Now
Available on Google Maps](https://transjakarta.co.id/news/real-time-transjakarta-information-now-available-on-google-maps)

**[PERGAMBARAN — Sedang]** Novita Nugraheni (Business Development &
Marketing, PT Transportasi Jakarta), LinkedIn, sekitar November 2024,
menambahkan sisi teknisnya:

> "As a transportation company, Transjakarta did not initially have GTFS data,
> prompting us to develop it. We began by creating GTFS Static… Google's
> system detected hundreds of errors, requiring us to repeatedly correct them
> until the data passed validation."

> "Approximately a week ago, Transjakarta went viral on social media with the
> exciting news that **real-time bus locations are now live on Google Maps**."

Sumber: [linkedin.com/posts/novita-nugraheni_…](https://www.linkedin.com/posts/novita-nugraheni_approximately-a-week-ago-transjakarta-went-activity-7199312881312555008-1ct1)

**Artinya untuk kita:** data transit Google di Jakarta **berasal dari GTFS
Transjakarta**, dan sekarang termasuk posisi kendaraan real-time. Kalau
Daily Route ingin memprediksi "bus berikutnya datang jam berapa", feed
GTFS-RT Transjakarta adalah sumber yang sama dengan yang dipakai Google.
Dan regulatorsinya jelas: Google memvalidasi feed itu, dan Transjakarta
butuh **ratusan perbaikan** agar lolos.

### 8.3 Kasus lokal: halte turun yang salah di Transjakarta

**[PERGAMBARAN — Rendah]** Laporan pengguna di Google Local Guides:

> "Google Maps currently suggests getting off at the 'Pos Pengumben' bus stop
> when taking TransJakarta bus number 8. However, the better option is to get
> off at the 'Kelapa Dua Sasak' bus stop… getting off at Pos Pengumben
> requires walking approximately **1 km** to reach Sinar Mutiara Cell. In
> contrast, if you get off at Kelapa Dua Sasak, the building is located right
> in front of the bus stop."

Sumber: [localguidesconnect.com](https://www.localguidesconnect.com/t/wrong-information-google-map-route/488178)

**Catatan:** ini adalah masalah **egress** (halte turun), bukan origin — tapi
mekanismenya sama: **Google memilih halte berdasarkan analisis, dan analisisnya
bisa salah**. Justru karena itu, Daily Route harus **menampilkan kandidat
halte alternatif** supaya pengguna bisa melihat dan memilih, bukan hanya
menyembunyikan keputusan di balik satu skor.

### 8.4 Ketidakakuratan jadwal

**[PERGAMBARAN — Rendah]** Thread Help Center: "for the same bus-route, a next
scheduled (not realtime) bus is reported by google maps 10min after the actual
scheduled slot."
([support.google.com/maps/thread/340947581](https://support.google.com/maps/thread/340947581))

Ini menunjukkan **GTFS Transjakarta pernah (dan masih bisa) mengandung**
ketidaksesuaian jadwal. Relevan: kalau Daily Route mengimpor GTFS nanti,
**wajib** memvalidasi (Google menyediakan validator: "the validator, used by
Google Maps and other major trip planning services").

### 8.5 Konteks: digitalisasi transport JMA

**[PERGAMBARAN — Sedang]** Pandyaswargo dkk. (2026), *Inclusivity assessment of
digitalizing public transportation in the Jakarta Metropolitan Area*, **Journal
of Public Transportation**, 19(4), 100163. DOI: 10.1016/j.jpubtr.2026.100163.
Survei 1.000 penumpang + 20 wawancara.

> "Journey-planning and navigation applications such as **Google Maps,
> Moovit, and MRT-J** support real-time routing."

> Wawancara 댓글ZIKE "more accurate map pin-drop locations in ride-hailing
> applications, **better digitally updated information systems**".

Sumber: [sciencedirect.com](https://www.sciencedirect.com/science/article/pii/S1077291X26000172)
| [waseda.elsevierpure.com](https://waseda.elsevierpure.com/ja/publications/inclusivity-assessment-of-digitalizing-public-transportation-in-t)

Tiga prioritas kebijakan yang mereka usulkan: (a) integrasi pembayaran lintas
mode, (b) platform digital yang lebih sederhana dan terintegrasi, (c) akses
digital yang lebih inklusif. **Tidak** membandingkan kualitas rute Google Maps
secara langsung — jadi **jangan** dipakai sebagai bukti kualitas rute.

### 8.6 Konteks jaringan (bukan tentang Google Maps)

- **[PERGAMBARAN — Tinggi]** ITDP, *Transjakarta: A Study in Success* (2019) —
  konteks integrasi dan pertumbuhan penumpang, **tidak** mengevaluasi
  kualitas rute Google Maps. [itdp.org](https://itdp.org/2019/07/15/transjakarta-study-success)
- **[PERGAMBARAN — Tinggi]** IDOS, *BRT Transjakarta: Phasing in,
  Performing and Expanding* — konteks sistem, **tidak** tentang Google Maps.
  [idos-research.de (PDF)](https://www.idos-research.de/uploads/media/Jauregui-Fung_BRT_Transjakarta_Draft_Report_IDOS.pdf)

**Tidak ditemukan:** ada **tidak** ada studi yang secara khusus mengukur
"seberapa sering Google Maps memilih halte yang benar di Jabodetabek" atau
"selisih rute Google Maps vs rute optimal di Jakarta". **Ini adalah celah
riset yang nyata.** Saya tidak mengarang study yang supposedly ada.

---

## 9. Implikasi untuk Daily Route

Bagian ini menerjemahkan temuan menjadi **aturan konkret**. Setiap aturan
menunjuk ke sumbernya dan menyatakan statusnya.

### 9.1 Prinsip

> **Aturan 0 — Asal bukan satu halte; asal adalah himpunan kandidat.**
> Yang dievaluasi bukan "halte terdekat", melainkan **perjalanan door-to-door
> utuh** untuk setiap kandidat halte, lalu dipilih yang skornya terendah.
>
> *Dasar:* §3.1 (RESMI, Tinggi) — transfer patterns Google dan struktur
> `legs[].steps[]`; §8.1 (RESMI/PERGAMBARAN) — temuan "Mind the Gap" bahwa
> yang dialami penumpang adalah **perjalanan utuh**, bukan satu bagiannya.
> *Status:* **RESMI — Tinggi**

### 9.2 Rumus skor

> **Aturan 1 — Skor kandidat =
> `totalMinutes + w_transfer × transferCount + w_walk × walkingKm + w_access × accessWalkKm + w_distance × distanceKm`**
>
> dengan `totalMinutes` = jalan kaki ke halte + waktu tunggu + waktu naik
> kendaraan + jalan kaki transfer + jalan kaki di akhir, dan **waktu tunggu
> sudah termasuk** di dalamnya.

| Bobot | Nilai awal | Alasan |
| --- | --- | --- |
| `w_transfer` | **3 menit** per pindah | Sudah dipakai di `packages/transit/src/graph.ts` sebagai `DEFAULT_TRANSFER_PENALTY_MINUTES`; mencerminkan "pindah = daftar ulang + cari platform + risiko salah" |
| `w_walk` | **1,0 menit/km** | Jalan kaki sudah termasuk durasi; tambahan kecil ini adalah "premium" untuk berjalan di bawah panas/hujan. Konsisten dengan cara GraphHopper, yang punya `beta_walk_time` dan bisa dinaikkan |
| `w_access` | **2,0 menit/km** | **Berjalan ke halte lebih mahal daripada berjalan di tengah perjalanan**: penumpang belum tahu pasti di mana halte itu dan bisa datang terlambat. Ini pembeda utama dari sekadar `w_walk` |
| `w_distance` | **0,4 menit/km** | Sudah dipakai di `graph.ts` sebagai `DISTANCE_WEIGHT_MINUTES_PER_KM` |

> **Aturan 2 — "Paling sedikit transit" harus dapatраждан.**
> Kalau `w_transfer` dinaikkan menjadi **7–8 menit**, kandidat yang butuh satu
> pindah lagi mulai kalah dari kandidat yang butuh jalan kaki lebih jauh.
> Justru inilah yang Google beri nama `FEWER_TRANSFERS`, dan inilah yang
> GraphHopper sebut "tie-breaker" yang bisa diaktifkan.
> *Dasar:* §3.2 (RESMI, Tinggi) — `FEWER_TRANSFERS` / `fewer_transfers`;
> §4.2.
> *Status:* bobot **kebijakan tim** — alasan berasal dari sumber, angkanya
> adalah pilihan kita dan harus diuji, bukan diklaim sebagai "aturan Google".

> **Aturan 3 — "Lebih sedikit jalan kaki" adalah profil kedua, bukan filter
> yang menyisihkan.**
> Gunakan dua set bobot (bisa dikonfigurasi), persis seperti Google:
> - **profil "paling cepat"** (default): `w_transfer` kecil (3), `w_access` kecil (2)
> - **profil "paling sedikit transit"**: `w_transfer` besar (7)
> - **profil "paling sedikit jalan kaki"**: `w_walk` dan `w_access` besar (3–4)
>
> *Dasar:* §3.2 dan §7.2 (RESMI, Tinggi).
> *Status:* **RESMI — Tinggi** untuk bentuknya (Google menyediakan dua
> enum preferensi), **kebijakan tim** untuk angkanya.

### 9.3 Ambang jarak jalan kaki

> **Aturan 4 — Jangan memotong kandidat dengan radius keras. Gunakan dua
> lapis.**
>
> **Lapis 1 (soft):** semua kandidat dalam radius 1,5 km **diberi skor**,
> tanpa pemotongan. Yang menang ditentukan bobot.
>
> **Lapis 2 (hard, hanya jika tidak ada hasil):** kalau tidak ada kandidat
> yang menghasilkan perjalanan sama sekali, ambil yang terdekat dan
> **labeli**-nya: "Halte terjauh dalam jangkauan (1,4 km)".
>
> **Aturan 5 — Tampilkan jarak jalan kaki dan alasan pilihannya.**
> Di kartu rute: "Berjalan **420 m** (6 mnt) ke Halte X" + alasan singkat
> ("paling cepat", "paling sedikit transit", "paling sedikit jalan kaki").
>
> *Dasar:* §4.4 (PERGAMBARAN, Tinggi) — argumen "resource limiting problem"
> dari maintainer OpenTripPlanner: **hard limit pada variabel yang bukan
> objective itu keliru**; §4.3 (PERGAMBARAN, Sedang) — batas jalan kaki
> Google ada tapi tidak dipublikasikan; §3.2 (RESMI) — Google menampilkan
> "less walking" sebagai filter, bukan bobot tersembunyi.
> *Status:* bentuk aturannya **PERGAMBARAN — Sedang**, angka radiusnya
> **kebijakan tim**. **Jangan** mengutip "500 m–1 km" sebagai "aturan
> Google".

### 9.4 Angka yang boleh dan tidak boleh dipakai

| Angka | Boleh dipakai sebagai? | Sumber |
| --- | --- | --- |
| 4,5 km/h kecepatan jalan | **Kebijakan tim** (sudah dipakai di `geo.ts`) | `packages/transit/src/geo.ts` |
| 0,4 menit/km untuk jarak | **Kebijakan tim** (sudah dipakai di `graph.ts`) | `packages/transit/src/graph.ts` |
| 3 menit per pindah | **Kebijakan tim** (sudah dipakai di `graph.ts`) | `packages/transit/src/graph.ts` |
| 5/4/6/3/6 menit tunggu rata-rata per mode | **Kebijakan tim** | `packages/transit/src/graph.ts` |
| 450–460 m | **Data empiris Google di Beijing** — boleh dikutip sebagai *studi kasus*, bukan sebagai parameter | Haitao dkk. 2019 |
| 500 m / 1 km | **Standar perencanaan** — boleh dikutip sebagai *praktik industri*, bukan sebagai "aturan Google" | Human Transit; TravelTime |
| "Google memakai bobot X" | **Dilarang** — tidak ada sumber | — |

### 9.5 Waktu tunggu: apa yang harus disampaikan kepada pengguna

> **Aturan 6 — Tulis eksplisit bahwa waktu tunggu adalah estimasi.**
> Selama belum ada GTFS, tampilkan: "Tunggu bus ±5 menit (headway rata-rata
> Koridor 1)". Jangan menulis "berangkat pukul 08:07" sebagai kepastian.
>
> *Dasar:* §5.3 (PERGAMBARAN, Sedang) — Google tidak menambah buffer di
> halte; §8.1 (RESMI/PERGAMBARAN, Tinggi) — "Mind the Gap": Google
> **melebihi** waktu tempuh yang dilaporkan penumpang untuk transit berbasis
> jalan di Greater Jakarta. Kesimpulan praktis: **jangan terlalu optimis, tapi
> jangan juga terlalu pessimis tanpa data.**
> *Status:* **kebijakan tim** yang berakar pada temuan.

> **Aturan 7 — Siapkan jalur GTFS, jangan karang jadwal.**
> Kalau nanti mengimpor GTFS/GTFS-RT (Transjakarta sudah melakukannya —
> §8.2), waktu tunggu harus **dihitung dari `stop_times.txt`**, bukan
> dari rata-rata. Dan feed harus divalidasi dengan validator yang sama
> dengan yang dipakai Google.
> *Dasar:* §5.2 (RESMI, Tinggi).
> *Status:* **RESMI — Tinggi** untuk formatnya.

### 9.6 Bentuk antarmuka

> **Aturan 8 — Tampilkan alternatif berdampingan, dengan satu skor.**
> Contoh dari Google: rute terbaik biru, alternatif abu-abu
> ([RESMI — Tinggi] §7.2). Di Daily Route: **tampilkan kandidat halte asal
> beserta skornya**, dan **satu** jawaban utama yang ditandai.
>
> *Dasar:* §7.2 (RESMI, Tinggi); §8.3 (PERGAMBARAN) — kasus Pos Pengumben
> menunjukkan keputusan halte Google bisa salah, jadi pengguna perlu
> bisa melihat pilihannya.

> **Aturan 9 — Jalan kaki adalah kaki pertama dan kaki terakhir dari
> perjalanan, bukan pelengkap.**
> Sumber resmi Google: *"A transit route also usually includes instructions
> on walking to, from, and between transit stations."*
> ([RESMI — Tinggi] §3.1). Daily Route sudah punya ini di `walk.ts`; yang
> belum ada adalah **skor yang memperlakukan kaki awal sebagai bagian dari
> perjalanan**.

### 9.8 Bukti nyata dari jaringan repo sendiri

Skrip `research/tools/ux-visual/make_origin_example.py` membangun contoh dari
`data/transit-network.json` memakai aritmetika yang sama dengan
`packages/transit/src/graph.ts`. Dua skenario, keduanya nyata:

| Skenario | Penumpang berdiri di | Tujuan | Kandidat |
| --- | --- | --- | --- |
| A | halte **St. Karet** (Transjakarta), Tanah Abang | Lebak Bulus Bank Syariah Indonesia (MRT, ujung selatan Lin NS) | 51 |
| B | halte **Bendungan Hilir** (Transjakarta) | Tomang (MRT, Lin NS) | 40 |

#### Skenario A — halte tempat berdiri adalah halte yang salah

| Halte asal | Jalan akses | Total | Pindah | Garis | Skor (tercepat) |
| --- | --- | --- | --- | --- | --- |
| **BNI City** (KRL) | 760 m | **51,0 mnt** | **0** | `krl-jabodetabek` → `mrt-jakarta:ns` | **59,1** |
| Dukuh Atas BNI (MRT) | 1,02 km | 52,0 mnt | 0 | `mrt-jakarta:ns` | 60,6 |
| Setiabudi Astra (MRT) | 1,49 km | 55,1 mnt | 0 | `mrt-jakarta:ns` | 64,6 |
| Tosari 1 (Transjakarta) | 1,10 km | 61,9 mnt | 1 | 2 garis | 74,1 |
| … | | | | | |
| **St. Karet** (Transjakarta) — **HALTE TEMPAT PENUMPANG BERDIRI** | **0 m** | **79,2 mnt** | **4** | `8c` → `9e` → `9` → `6m` → jalan kaki → `mrt-jakarta:ns` | 97,6 |

**Dua fakta yang harus dihafal:**

1. **Berjalan 760 m lebih jauh menghemat 28 menit dan menghapus empat kali
   pindah.** Perjalanan dari halte tempat berdiri: 8C → 9E → 9 → 6M → jalan
   kaki 210 m → MRT NS. **Empat kali pindah, 23 menit menunggu, 79 menit.**
   Perjalanan dari BNI City: jalan kaki 760 m, lalu **MRT NS langsung, nol
   pindah, 51 menit.**
2. **Aturan yang dipakai aplikasi hari ini tidak akan pernah melihat jawaban
   yang benar.** `walk.ts` GET `/plan` memotong kandidat menjadi **4**
   berdasarkan `distanceKm - 0,1 km` (bonus interchange) — dan memotongnya
   **sebelum** perjalanan diukur. Kandidat yang terpilih adalah empat halte
   Transjakarta terdekat; **BNI City, Dukuh Atas BNI, dan Setiabudi Astra
   tidak pernah masuk kandidat.** Perbedaannya bukan 2 menit; perbedaannya
   **28 menit**.

#### Skenario B — profil yang berbeda memilih halte yang berbeda

| Profil | Pemenang | Total | Pindah | Jalan akses | Skor |
| --- | --- | --- | --- | --- | --- |
| `fastest` | **Plaza Sentral** | 54,7 mnt | 3 | 220 m | 67,3 |
| `fewer-transfers` | **Bendungan Hilir** | 60,1 mnt | 2 | **0 m** | 80,1 |
| `less-walking` | Plaza Sentral | 54,7 mnt | 3 | 220 m | 69,5 |

Perjalanan dari **Plaza Sentral**: 6D → jak-09 → 8M → T12 → jalan kaki ke
MRT Tomang. **Tiga kali pindah, 54,7 menit.**
Perjalanan dari **Bendungan Hilir** (halte tempat penumpang berdiri): 1 → 2A →
T12 → jalan kaki ke MRT Tomang. **Dua kali pindah, 60,1 menit.**

Jadi "paling sedikit transit" **tidak memilih halte yang sama** dengan
"paling cepat": ia memilih halte tempat penumpang berdiri, dengan **satu kali
pindah lebih sedikit**, danharga **5,4 menit lebih lama**. Keduanya adalah
jawaban yang benar untuk preferensi yang berbeda — dan inilah alasan
Google Maps menyediakan `LESS_WALKING` dan `FEWER_TRANSFERS` sebagai dua
preferensi terpisah, bukan satu.

#### Menjalankan contohnya

```bash
# skenario A
python3 research/tools/ux-visual/score_routes.py --example

# skenario B, dengan profil dan bobot yang lain
python3 research/tools/ux-visual/score_routes.py \
  --example-file research/tools/ux-visual/examples/origin-candidates.bendungan-hilir.json \
  --profile fewer-transfers

# bobot sendiri, tanpa mengubah kode
python3 research/tools/ux-visual/score_routes.py --weight-transfer 8 --weight-access-walk-per-km 4
```

Contoh lengkapnya ada di
`research/tools/ux-visual/examples/origin-candidates.tanah-abang.json` dan
`research/tools/ux-visual/examples/origin-candidates.bendungan-hilir.json`.

Catatan kejujuran: jarak jalan kaki pada contoh itu adalah **jarak lurus ×
1,25** (faktor belokan), **bukan** rute kaki OSRM. Produksi memakai
`fetchWalkingRoute` di `apps/api/src/routes/walk.ts`. Bedanya hanya pada
bentuk jalur kaki; durasi total, jumlah pindah, dan garis yang dipakai
dihitung dari data jaringan yang sama.

### 9.9 Pemetaan ke kode yang ada

|.File | Yang perlu berubah | Prioritas |
| --- | --- | --- |
| `apps/api/src/routes/walk.ts` (GET `/plan`) | (1) Jangan potong kandidat ke 4 hanya berdasarkan jarak lurus; (2) skor baru dengan `w_access`/`w_walk`; (3) kembalikan breakdown skornya | **Tinggi** |
| `apps/api/src/routes/walk.ts` (GET `/`) | Endpoint ini memang "jalan ke halte terdekat" — beri tahu pengguna bahwa itu bukan pilihan terbaik, dan arahkan ke `/plan` | Sedang |
| `packages/transit/src/graph.ts` | Belum perlu berubah: A* sudah menjumlahkan durasi, jarak, penalti pindah, dan waktu tunggu. Yang berubah adalah **fungsi pemanggil** yang menilai beberapa kandidat | Rendah |
| `packages/transit/src/geo.ts` | Tidak berubah | — |
| `research/tools/ux-visual/score_routes.py` | **Baru** — alat untuk menguji bobot di atas terhadap data nyata | — |

> **Catatan penting tentang `walk.ts` GET `/plan` yang sudah ada.**
> Endpoint itu **sudah** mengevaluasi beberapa kandidat halte, tapi:
> - kandidat dipotong menjadi 4 berdasarkan `distanceKm - 0,1 km` (bonus
>   interchange) **sebelum** perjalanan diukur — jadi halte ke-5 yang
>  scss lebih baik tidak pernah ikut dinilai;
> - skornya hanya `totalMinutes + transferCount * 3` — **tidak ada bobot
>   jalan kaki** dan **tidak ada bobot jarak**;
> - `planRoutes(..., { maxAlternatives: 1 })` — hanya itinerary tercepat per
>   kandidat yang dibandingkan;
> - **ketika `destination` kosong**, `itinerary` bernilai `null`, sehingga
>   `totalMinutes` = durasi jalan kaki saja → **skor jatuh ke "paling dekat"**.
>   Inilah bug yang palingMirip: begitu tujuan tidak diketahui, planner
>   kembali ke nearest-stop.
>
> Perbaikan ini **bukan** rewrite: ia mengubah satu blok penilaian dan
> menambah parameter bobot.

---

## 10. Hal yang **tidak** bisa diverifikasi

Daftar ini sengaja dibuat tegas, sesuai permintaan tugas.

1. **Bobot numerik persis** yang dipakai Google di router transitnya.
   Tidak dipublikasikan. Yang dipublikasikan hanya *nama* preferensi
   (`LESS_WALKING`, `FEWER_TRANSFERS`) dan daftar faktor generik.
2. **Ambang jarak jalan kaki maksimum milik Google.** Hanya ada laporan
   pihak ketiga ("not disclosed", "often exceeds TravelTime's 15 minutes").
   **Tidak ada angka resmi Google.** Semua angka 500 m / 1 km yang beredar
   berasal dari standar perencanaan, bukan Google.
3. **Apakah Google menjalankan access search terpisah** (seperti OTP) atau
   menyatukannya dalam satu graf waktu-tergantung. Tidak dipublikasikan.
   Struktur output (langkah jalan kaki = langkah biasa) konsisten dengan
   keduanya.
4. **Algoritma produksi Google Maps hari ini.** Yang terverifikasi adalah
   *Transfer Patterns* dan turunannya (Google Research, 2016). Klaim
   "Google Maps memakai RAPTOR" **tidak** memiliki dukungan resmi dan
   tidak saya temukan.
5. **Apakah Google benar-benar membandingkan beberapa halte asal secara
   deterministik**, atau hanya menampilkan "the best route" di antara
   kandidat yang dibatasi. Yang terverifikasi: perilakunya **berubah
   menurut jam keberangkatan** (§5.3), yang **tidak mungkin** terjadi kalau
   origin dipatok ke halte terdekat.
6. **Skor numerik untuk "3 menit per pindah"** — ini **kebijakan tim** Daily
   Route, bukan angka dari Google. Yang benar-benar dari Google hanya
   *nama* preferensinya.
7. **Studi yang khusus mengukur ketepatan pilihan rute Google Maps di
   Jabodetabek.** Tidak ditemukan. Yang ada: "Mind the Gap" (Bastarianto
   dkk. 2025) mengukur **selisih waktu tempuh**, bukan **kualitas pilihan
   rute**. Saya tidak mengarang studi yang sebenarnya tidak ada.
8. **Berapa lama Google Maps "berpikir"** sebelum menampilkan rute, dan
   apakah urutan alternatif dihitung sesuai "ETA, jumlah perpindahan,
   panjang perjalanan" secara harfiah atau hanya deskriptif. Blog Nov 2023
   bersifat deskriptif.
9. **Nilai `beta_walk_time` milik Google.** Parameter itu milik
   **GraphHopper**, bukan Google.
10. **Apakah Google Maps di Indonesia menampilkan chip "Least walking"**
    secara default, dan apakah filter itu tersedia untuk semua kota.
    Dokumentasi tidak menyertainya; laporan pihak ketiga tidak spesifik
    Indonesia.

---

## 11. Daftar URL

### Dokumentasi resmi Google (RESMI)

| Topik | URL |
| --- | --- |
| Blog resmi: pembaruan rute transit Nov 2023 | https://blog.google/products-and-platforms/products/maps/google-maps-updates-november-2023 |
| Blog resmi: first & last mile (cycling + ridesharing) | https://blog.google/products-and-platforms/products/maps/travel-your-first-and-last-mile-google-maps |
| Blog resmi: comprehensive view of modes (2024) | https://blog.google/products-and-platforms/products/maps/redefining-what-map-can-be-new-information-and-ai |
| Help Center: Get directions & show routes | https://support.google.com/maps/answer/144339 |
| Help Center: Create a GTFS Realtime feed (polling 30 detik) | https://support.google.com/transitpartners/answer/6368391 |
| Routes API: Get a transit route | https://developers.google.com/maps/documentation/routes/transit-route |
| Routes API: TransitPreferences | https://developers.google.com/maps/documentation/routes/reference/rest/v2/TransitPreferences |
| Routes API: computeRoutes | https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes |
| Routes API: release notes | https://developers.google.com/maps/documentation/routes/release-notes |
| Legacy: Distance Matrix API (transit_routing_preference) | https://developers.google.com/maps/documentation/distance-matrix/distance-matrix |
| Legacy: Directions API (transit_routing_preference) | https://developers.google.com/maps/documentation/directions/get-directions |
| Google Transit: GTFS Static | https://developers.google.com/transit/gtfs |
| Google Transit: GTFS Realtime | https://developers.google.com/transit/gtfs-realtime |
| Google Transit: GTFS Realtime differences | https://developers.google.com/transit/gtfs-realtime/reference |
| Google Transit: static validation errors & warnings | https://developers.google.com/transit/gtfs/guides/static-errors-warnings |
| Google Research: Transfer Patterns (2016) | https://research.google/blog/an-update-on-fast-transit-routing-with-transfer-patterns |
| Maps Platform produk: Transit route preferences | https://mapsplatform.google.com/maps-products/routes |
| Maps JS API: Directions Service (polyline per step) | https://developers.google.com/maps/documentation/javascript/legacy/directions |

### Akademik & teknis (PERGAMBARAN)

| Topik | URL |
| --- | --- |
| Bastarianto dkk. 2025 — 'Mind the Gap', Greater Jakarta (PDF) | https://eprints.whiterose.ac.uk/id/eprint/228392/1/1-s2.0-S2213624X25001452-main.pdf |
| Bastarianto dkk. 2025 — record | https://eprints.whiterose.ac.uk/id/eprint/228392 |
| Bastarianto dkk. 2025 — TRID | https://trid.trb.org/View/2564417 |
| Pandyaswargo dkk. 2026 — JMA digitalization, Journal of Public Transportation | https://www.sciencedirect.com/science/article/pii/S1077291X26000172 |
| Haitao dkk. 2019 — Measuring Public Transit Accessibility via Google API | https://opentransportationjournal.com/VOLUME/13/PAGE/93/FULLTEXT |
| Lahoorpoor & Levinson 2020 — Transit Travel Time Machine (OTP vs Google) | https://transportist.org/2019/11/19/the-transit-travel-time-machine-comparing-three-different-tools-for-travel-time-estimation |
| Delling, Katz, Pajor 2012 — RAPTOR (Microsoft Research) | https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf |
| OpenTripPlanner 2 — Bibliography (access/transit/egress) | https://docs.opentripplanner.org/en/latest/Bibliography |
| OpenTripPlanner 2 — RouteRequest (maxDuration, maxStopCount, penalty) | https://docs.opentripplanner.org/en/latest/RouteRequest |
| OpenTripPlanner #967 — "resource limiting problem" | https://github.com/opentripplanner/OpenTripPlanner/issues/967 |
| transnetlab/transit-routing — location-based queries, multi-stop | https://github.com/transnetlab/transit-routing |
| Tennøy dkk. 2022 — walking distance to stops (328–520 m) | https://www.sciencedirect.com/science/article/pii/S1361920922000013 |

### Pihak ketiga / laporan (PERGAMBARAN)

| Topik | URL |
| --- | --- |
| TravelTime KB — perbedaan model dengan Google (max walk) | https://help.traveltime.com/en/articles/8524070-how-the-transport-models-compare-to-google-maps |
| GraphHopper forum — Google "walk to farther bus stop" | https://discuss.graphhopper.com/t/route-suggests-walking-to-farther-bus-stop/3702 |
| America Walks — "less walking" vs "more walking" | https://americawalks.org/hacking-the-map-apps-for-active-transportation-less-walking-vs-more-walking-as-a-means-of-optimized-movement-and-mobility |
| Human Transit — standar jarak jalan kaki (bukan Google) | https://humantransit.org/2011/04/basics-walking-distance-to-transit.html |
| Via — preferensi berjalan kaki penumpang (survei Jerman) | https://ridewithvia.com/resources/long-walking-distance-prevents-people-from-using-transit-heres-how-to-change-that |
| HowToGeek — chip opsi rute transit di UI | https://www.howtogeek.com/google-maps-features-that-make-public-transit-less-confusing |
| Help Center thread — jadwal bus meleset 10 menit | https://support.google.com/maps/thread/340947581 |
| Help Center thread — "grey dashed line" untuk walking | https://support.google.com/maps/thread/225630424 |
| Google Local Guides — Transjakarta 8, Pos Pengumben vs Kelapa Dua Sasak | https://www.localguidesconnect.com/t/wrong-information-google-map-route/488178 |
| Transjakarta (resmi) — real-time bus di Google Maps, 11 Jul 2024 | https://transjakarta.co.id/news/real-time-transjakarta-information-now-available-on-google-maps |
| LinkedIn (Transjakarta) — pengembangan GTFS Static | https://www.linkedin.com/posts/novita-nugraheni_approximately-a-week-ago-transjakarta-went-activity-7199312881312555008-1ct1 |
| Level 12 — TravelTime vs Google, isochrone & durasi | https://www.level12.io/blog/traveltime-vs-google-maps-api-commute-mapping-job-search |
| Tutorial video — Google tidak menambah buffer di halte | https://www.youtube.com/watch?v=lU_lDLEA_-A |
| Cal-ITP — laporan kualitas GTFS bulanan | https://reports.dds.dot.ca.gov |

### Konteks (bukan tentang kualitas rute)

| Topik | URL |
| --- | --- |
| ITDP — Transjakarta: A Study in Success | https://itdp.org/2019/07/15/transjakarta-study-success |
| IDOS — BRT Transjakarta (PDF) | https://www.idos-research.de/uploads/media/Jauregui-Fung_BRT_Transjakarta_Draft_Report_IDOS.pdf |

---

## 12. Ringkasan aturan (siap ditempel di PR)

1. **Jangan pernah memilih halte asal berdasarkan jarak terdekat.** Evaluasi
   beberapa kandidat, ukur perjalanan door-to-door utuh untuk masing-masing,
   pilih yang skor terendah.
2. **Skor** = `totalMinutes + 3×pindah + 1,0×kmJalanKaki + 2,0×kmJalanKakiAwal
   + 0,4×kmJalanRute`, dengan waktu tunggu **sudah termasuk** di
   `totalMinutes`.
3. **"Paling sedikit transit"** = profil bobot dengan `w_transfer` ≈ 8;
   **"paling sedikit jalan kaki"** = `w_walk`/`w_access` ≈ 4. Ketiganya
   dihitung dari data yang sama, dan **ditampilkan berdampingan** — bukan
   disembunyikan di balik satu skor.
4. **Tanpa radius keras.** Semua kandidat dalam 1,5 km diskor; radius hanya
   jadi pagar **lapis kedua** kalau tidak ada rute sama sekali, dan itu
   harus **diberi tahu pengguna**.
5. **Waktu tunggu adalah estimasi** sampai ada GTFS: tampilkan "±5 menit
   (headway rata-rata)", jangan menulis "berangkat 08:07" sebagai kepastian.
6. **Jangan pernah memotong kandidat sebelum perjalanan diukur.** Hari ini
   `walk.ts` GET `/plan` mengambil 4 halte terdekat berdasarkan jarak lurus
   saja; pada kasus nyata di §9.8, jawaban yang benar ada di urutan ke-25.
7. **Abaikan atau perbaiki kondisi yang membuat skor jatuh ke "paling
   dekat".** Saat `destination` kosong, `itinerary` bernilai `null`, sehingga
   skor hanya berisi durasi jalan kaki — planner kembali ke nearest-stop
   tanpa sadar.

### Berkas yang ditulis

| Berkas | Isi |
| --- | --- |
| `research/google-maps-routing.md` | Laporan ini |
| `research/tools/ux-visual/score_routes.py` | Alat peringkat dengan bobot yang bisa diubah; baca JSON dari stdin |
| `research/tools/ux-visual/make_origin_example.py` | Generator contoh dari `data/transit-network.json` |
| `research/tools/ux-visual/examples/origin-candidates.tanah-abang.json` | Contoh nyata skenario A (51 kandidat) |
| `research/tools/ux-visual/examples/origin-candidates.bendungan-hilir.json` | Contoh nyata skenario B (40 kandidat) |
