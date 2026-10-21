# Craft UI/UX untuk Aplikasi Rute Transit

> **Status:** laporan riset, 21 Oktober 2026.
> **Ruang lingkup:** cara merancang antarmuka *hasil rute* untuk aplikasi
> transit — hierarki informasi, alternatif, tipografi, spasi, microcopy bahasa
> Indonesia, dan pola interaksi. Bukan peta umum, bukan arsitektur data.
> **Cara memakai:** bagian 7 adalah audit terhadap `apps/web/src` hari ini;
> bagian 8 adalah angka final yang siap diimplementasi; bagian 9 adalah daftar
> sumber; bagian 10 adalah katalog 20 tanda "slop" beserta penggantinya.
> Specifikasi mesinnya: `research/ux-transit-craft.spec.json`. Pemeriksa
> otomatisnya: `research/tools/ux-visual/typography_check.py`.
> Laporan ini melengkapi, bukan menggantikan, `research/ux-visual-language.md`
> (yang sudah menangani warna, radius, bayangan, dan peta).

---

## 0. Ringkasan: sepuluh perubahan paling berdampak

Diurutkan dari yang paling mengubah rasa antarmuka. Angka diambil dari
bagian 8 dan sudah bisa diperiksa dengan skrip.

| # | Perubahan | Angka persisnya | Kenapa ini yang pertama |
| --- | --- | --- | --- |
| 1 | **Istilah "halte" dan "stasiun" mengikuti moda, bukan satu kata untuk semua** | Bus → "halte"; MRT, LRT Jakarta, LRT Jabodebek, KRL → "stasiun" | Penumpang mencari "Stasiun MRT Lebak Bulus", bukan "halte Lebak Bulus". Salah istilah = pencarian gagal |
| 2 | **Durasi jadi satu-satunya angka besar; jarak dan pindah menyusul sebagai baris meta** | Durasi 40 px / 1,05 / 700 / −0,03em; meta 13 px / 1,5; meta 12 px / 1,45 | Prinsip "The answer comes first" baru benar kalau satu elemen saja yang besar |
| 3 | **Alternatif pindah dari tab menjadi daftar perbandingan dengan label tujuan optimasi** | Maks 3 alternatif; label "Tercepat", "Paling sedikit pindah", "Rekomendasi"; selisih "+6 mnt · 1 pindah lebih banyak" | Tab menyembunyikan perbandingan; daftar memamerkannya |
| 4 | **Label alternatif tidak lagi menyalin kode jalur** | `9D · 4C` → `Rekomendasi · +8 mnt` | Kode jalur adalah detail, bukan alasan memilih rute |
| 5 | **Eyebrow 12 px uppercase hanya berisi kata kiasan; nama tempat tidak pernah uppercase** | 12 px / 1,35 / 600 / +0,04em; nama tempat 13 px sentence case | `BUNDARAN HI ASTRA → KELAPA GADING` menghapus nama diri |
| 6 | **Angka 10 px dan 11 px naik ke 12 px** | Lantai 12 px untuk label, metadata, kode; teks isi 13 px | 10 px di bawah terik Jakarta tidak terbaca |
| 7 | **Copy tarif dan stempel waktu: "Tarif", bukan "Perkiraan tarif"** | `Perkiraan tarif` → `Tarif`; `Data per 21 Okt 2026, 10.14` → `Terakhir dihitung 21 Okt 2026, 10.14 WIB` | "Perkiraan" menutupi bahwa sumber angkanya tidak disebut |
| 8 | **Waktu ditulis dengan titik, bukan titik dua** | `10.14 WIB`, bukan `10:14 WIB` | PUEBI III.A.3: tanda titik memisahkan jam dan menit |
| 9 | **Negara/rupiah: `Rp5.000` tanpa spasi** | `Rp5.000` | PUEBI II.H.5: lambang mata uang melekat pada angka |
| 10 | **Spasi keluar dari skala 4 px; setengah langkah hanya untuk jarak optis di dalam komponen** | Skala: 0, 1, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 | "Sedikit lebih longgar" adalah bug, bukan keputusan desain |

---

## 1. Metode dan status sumber

### 1.1 Metode

Riset dilakukan dengan `mcp__tavily__tavily_search`,
`mcp__tavily__tavily_extract`, dan `mcp__tavily__tavily_map`. `web_search`
tidak dipakai (mengembalikan HTTP 401). Setiap klaim di dokumen ini
dibuat-buat dari sumber yang **dibuka dan dibaca**, bukan dari ingatan; klaim
yang tidak bisa diverifikasi ada di bagian 11.

Dua lapis sumber dipisahkan tegas:

- **Dokumentasi dan panduan resmi** — design system pemerintah dan operator,
  dokumen standar ejaan, dokumentasi produk asli, guidelines aksesibilitas.
- **Opini desainer** — kritik desain, studi kasus, artikel. Boleh dipakai untuk
  *menerangkan alasan*, tidak boleh dipakai untuk *menetapkan angka*.

### 1.2 Yang sudah dibaca langsung

| Sumber | Jenis | Yang diambil |
| --- | --- | --- |
| [NSW Design System — Typography](https://designsystem.nsw.gov.au/core/typography) | resmi | Skala heading: 36/48, 28/32, 22/24, 18/20, 16/24; body 16/24; small 14/19 |
| [Digital NSW — Typography](https://www.digital.nsw.gov.au/delivery/accessibility-and-inclusivity-toolkit/design/typography) | resmi | Aturan WCAG 1.4.12: line spacing ≥ 1,5×; paragraph spacing ≥ 2× |
| [Apple HIG — Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | resmi | Tabel SF Pro di Dynamic Type "Large": 34/41, 28/34, 22/28, 20/25, 17/22, 16/21, 15/20, 13/18, 12/16, 11/13 |
| [Carbon — Spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview) | resmi | Skala spasi 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160 |
| [Carbon — Typography type sets](https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets) | resmi | productive 14 px, expressive 16 px; tracking 0,32 px pada 12 px |
| [Carbon — Loading pattern](https://v10.carbondesignsystem.com/patterns/loading-pattern) | resmi | Skeleton + loading indicator; rujukan Nielsen Norman Group soal skeleton |
| [NN/g — Designing Empty States](https://www.nngroup.com/articles/empty-state-interface-design) | resmi (NN/g) | "Do not default to totally empty states"; "Use Empty States to Provide Learning Cues"; "Provide direct pathways" |
| [NN/g — Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog) | resmi (NN/g) | Jangan pakai dialog konfirmasi untuk aksi rutin; utamakan undo |
| [NN/g — Cancel vs Close](https://www.nngroup.com/articles/cancel-vs-close) | resmi (NN/g) | Error harus muncul dekat titik kegagalan; tombol teks, bukan ikon ambigu |
| [NN/g — Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition) | resmi (NN/g) | "Use no more than 3 sizes"; "Limit how many elements are big to a maximum of 2"; maksimal 3 variasi kontras |
| [PUEBI (Kementerian Pendidikan)](https://repositori.kemendikdasmen.go.id/270/1/PUEBI.pdf) | resmi | III.A.3 (titik untuk jam), III.A.5 (titik ribuan), II.H.5 (lambang mata uang), II.I.4 (angka untuk waktu/ukuran/nilai uang) |
| [PUEBI Daring — Angka dan Bilangan](https://ivanlanin.github.io/puebi/kata/angka-dan-bilangan) | resmi (rujukan PUEBI) | "Rp5.000,00"; "1 jam 20 menit"; "Rp10 triliun" |
| [PUEBI Daring — Tanda Titik](https://ivanlanin.github.io/puebi/tanda-baca/tanda-titik) | resmi (rujukan PUEBI) | "pukul 01.35.20"; tabel diberi titik setelah nomor |
| [JDIH Kementerian Keuangan — Definisi Halte](https://jdih.kemenkeu.go.id/kamus-hukum/halte?id=10d118b2ba587e83e1654a25a8648367) | resmi | "Halte adalah tempat pemberhentian Kendaraan Bermotor Umum untuk menaikkan dan menurunkan penumpang" (UU 22/2009) |
| [BPIW Kamus — Halte](https://bpiw.pu.go.id/bankdata/dictionary/words?q=Halte&id=591) | resmi | "tempat pemberhentian kendaraan bermotor umum" |
| [Transjakarta](https://www.transjakarta.co.id/) | resmi (operator) | Bahasa layanan: "titik perhentian", "Angkutan Pengumpan", "Mikrotrans" |
| [LRT Jakarta](https://lrtjakarta.co.id/) | resmi (operator) | Terminologi resmi: "Stasiun Velodrome", "stasiun" untuk semua titik |
| [Jaklingko Indonesia](https://jaklingkoindonesia.co.id/) | resmi (operator) | "Tarif Integrasi", "Mobility as a Service (MaaS)", "Account Based Ticketing" |
| [TfL — Design standards](https://tfl.gov.uk/info-for/suppliers-and-contractors/design-standards) | resmi | Peta standar per moda; TfL Go sebagai produk acuan |
| [TfL — Colour Standard (PDF)](https://content.tfl.gov.uk/tfl-colour-standard.pdf) | resmi | Warna moda per sistem; bukti bahwa warna adalah taksonomi operator |
| [LTA — Plan Your Journey](https://www.lta.gov.sg/content/ltagov/en/getting_around/public_transport/plan_your_journey.html) | resmi | MyTransport.SG, tarif, dan struktur information CTA |
| [MyTransport.SG (App Store)](https://apps.apple.com/sg/app/mytransport-sg/id1306661188) | resmi (produk) | "Multi-modal Journey Planner — Start planning your journey with different transport options" |
| [Google — Routes API, alternative routes](https://developers.google.com/maps/documentation/routes/alternative-routes) | resmi (produk) | `routeLabels`: `DEFAULT_ROUTE`, `DEFAULT_ROUTE_ALTERNATE` — rute dilabeli menurut tujuan optimasi, bukan menurut nomor |
| [Red Hat — Popover guidelines](https://ux.redhat.com/elements/popover/guidelines) | resmi (design system) | Tooltip = identifikasi singkat; popover = penjelasan + aksi; di desktop popover terbuka saat klik |
| [Shopify — Polaris tokens](https://github.com/Shopify/polaris-tokens) | resmi (design system) | Skala tipografi 30/24/20/16/14/12 dan spasi 4–32 pada basis 4 px |

### 1.3 Opini desainer yang dipakai (hanya untuk alasan, bukan angka)

| Sumber | Yang diambil |
| --- | --- |
| [Pratt IXD — Design Critique: Citymapper](https://ixd.prattsi.org/2026/02/design-critique-citymapper-ios-app) | Mode filter sebagai *constraint*, bukan pengaturan; konteks muncul tepat waktu |
| [ModeShift — UI/UX in Public Transit Apps](https://www.modeshift.com/mobile-ui-ux-public-transit-systems) | Legibilitas dan tap-friendliness di bawah terik; hemat langkah ketik |
| [Smashing Magazine — Dangerous Actions](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces) | Pola undo untuk aksi yang reversible |
| [UserOnboard — Permission Priming](https://www.useronboard.com/onboarding-ux-patterns/permission-priming) | Permission priming sebelum prompt sistem |
| [DesignSystems.one — Polaris](https://www.designsystems.one/design-systems/polaris) | Ringkasan angka Polaris |
| [DesignSystems.surf — Typography System 101](https://designsystems.surf/articles/typography-system-101-a-step-by-step-guide) | Layer token: primitive → scale → semantik |

### 1.4 Yang tidak bisa diverifikasi

Lihat bagian 11. Ringkasnya: **Mobbin** (paywall, tidak dibaca), **Baymard**
(e-commerce, tidak relevan untuk transit dan tidak dipakai), **kci.id**
(situs tidak merespons), **DB Navigator / SNCF Connect / OMNY / BART / MTA**
(dokumentasi UI publik tidak ditemukan — hanya halaman App Store), dan
**EFTA/EGAUM** (tidak ada pedoman istilah layanan penumpang "KAATU" yang bisa ditemukan publik
untuk KAATU/Komdigi; yang dipakai adalah UU 22/2009, PP 79/2013, PM 15/2019,
KBBI, dan PUEBI).

---

## 2. Aplikasi transit yang dipakai sebagai acuan

### 2.1 Tabel per aplikasi

Kolom **Status** menyatakan seberapa dalam sumbernya dibaca. Aplikasi yang
hanya dibaca dari halaman toko tanpa verifikasi tampilan **tidak** diberi
penilaian dari ingatan.

| Aplikasi | Yang baik | Yang buruk | Yang bisa diadopsi | Status |
| --- | --- | --- | --- | --- |
| **Citymapper** | Filter mode ("Classic", "Walk Less", "Turbo", "Price") bekerja sebagai *constraint*, bukan panel pengaturan; konteks perjalanan muncul tepat waktu, bukan memenuhi layar; instruksi dan peta saling terkait | Terlalu banyak pilihan di awal membuat filter membingungkan; tidak ada jalan keluar cepat ketika pencarian gagal | Mode filter sebagai constraint; panel hasil yang menampilkan bentuk perjalanan, bukan daftar panjang | Halaman App Store + kritik desain Pratt IXD (dibaca) |
| **Transit (app)** | Membuka langsung ke waktu kedatangan langsung per jalur di sekitar pengguna; bus yang dibatalkan ditandai berbeda dari yang terjadwal | Penentuan rute bisa keliru saat bus dibatalkan tapi masih terjadwal; harus selalu menampilkan bus berikutnya | Bedakan "langsung" dari "terjadwal" secara visual, bukan lewat catatan kaki | Diskusi pengguna (opini) |
| **TfL Go** | Planner menampilkan label rute menurut tujuan optimasi ("Fastest route", "Alternative route", "Step-free route", "Bus-only route"), bukan "Rute 1/2/3"; status keterlambatan tampil sebagai kata | Tidak menampilkan tarif di dalam aplikasi; pembacaan masih perlu beberapa saat | Label rute = tujuan optimasi (lihat bagian 3.3) | App Store + panduan TfL (dibaca) |
| **MyTransport.SG (LTA)** | "Multi-modal Journey Planner" dengan pilihan moda berbeda; tarif dan waktu tiba dalam satu aplikasi; bagian "Near You" untuk layanan terdekat | Informasi datang dari banyak sumber (MRT, bus, jalan) sehingga layar utama padat | Pisahkan "rencana" dari "terdekat": dua pintu masuk, bukan satu | App Store + halaman LTA (dibaca) |
| **Metro Sydney / TfNSW** | Warna moda dijamin lewat "Transport Network Colour Chart" per sistem; tipografi konsisten (Public Sans, skala 14/16/18/20/22/28/36) | Skala heading itu untuk halaman web, bukan untuk layar kecil; produk mobile butuh skala sendiri | Warna = taksonomi sistem, bukan livery kendaraan; skala tipografi mobile terpisah dari skala web | Design system NSW + colour standard (dibaca) |
| **Seoul Metro / Seoul Metropolitan Government** | Aplikasi resmi untuk turis: mendeteksi peron yang dilalui pengguna saat tiba di stasiun; memperingatkan bila naik kereta yang salah; **arah** kereta dijelaskan, bukan hanya nama | Peron tetap perlu dibaca; fitur ini hanya berguna bila data langsungnya akurat | Beri tahu simpul yang harus dilalui berikutnya, bukan hanya daftar | Siaran resmi SMG (dibaca) |
| **Google Maps (transit)** | Rute dilabeli lewat `routeLabels` (`DEFAULT_ROUTE`, `DEFAULT_ROUTE_ALTERNATE`, `FUEL_EFFICIENT`); polyline tiap rute bisa digambar sendiri; durasi dan jarak tiap rute selalu dibandingkan | Label "Default" tidak menjelaskan mengapa rute itu dipilih | Rute alternatif membawa label tujuan optimasi plus selisih angka | Dokumentasi Routes API (dibaca) |
| **TfNSW Trip Planner** | Opsi aksesibilitas (tanpa tangga, tangga tanpa eskalator, akses bebas) ditawarkan sebagai filter, bukan sebagai tambahan | Opsi aksesibilitas menambah cabang pada pohon yang sudah padat | Filter aksesibilitas ditampilkan sebagai constraint, bukan sebagai pengaturan | Design system NSW (dibaca) |
| **Moovit** | — | — | — | **Tidak diverifikasi** (halaman App Store saja) |
| **OMNY** | — | — | — | **Tidak diverifikasi** |
| **DB Navigator** | — | — | — | **Tidak diverifikasi** |
| **SNCF Connect** | — | — | — | **Tidak diverifikasi** |
| **BART / MTA** | — | — | — | **Tidak diverifikasi** |
| **ÖBB ScottyMobile** | — | — | — | **Tidak diverifikasi** |

### 2.2 Yang berulang di semua aplikasi acuan yang kuat

Lima pola muncul di setiap aplikasi yang benar-benar dipakai penumpang
setiap hari, dan kelimanya cocok dengan produk ini:

1. **Jawabannya satu angka besar.** Durasi tempuh adalah elemen pertama yang
   dibaca, dan ukurannya berbeda jelas dari yang lain.
2. **Rincian bisa dibuka, tidak dibentangkan di depan mata.** Daftar halte
   penuh selalu di balik `<details>` atau interaksi miripnya.
3. **Peta dan daftar adalah satu sistem,** bukan dua tampilan terpisah.
4. **Alternatif diberi alasan, bukan nomor.**
5. **Mode selalu dienkode tiga kali:** warna, ikon, dan kode teks. Warna
   sendirian tidak pernah cukup.

---

## 3. Hierarki informasi dalam rute transit

### 3.1 Urutan informasi yang benar

Urutan ini mengikuti urutan pertanyaan yang muncul di kepala penumpang, dari
yang paling tidak bisa ditunda sampai yang paling bisa ditunda:

| Peringkat | Informasi | Ukuran | Token | Sumber |
| --- | --- | --- | --- | --- |
| 1 | **Durasi tempuh** | 40 px / 1,05 / 700 / −0,03em | `text-display` | `DESIGN.md` "The answer comes first"; NN/g "Make the most important element biggest" |
| 2 | **Jarak dan jumlah pindah** | 13 px / 1,5 / 400 | `text-body-sm` | `DESIGN.md` §"The itinerary header" |
| 3 | **Asal ke tujuan** | 13 px / 1,5 / 400 | `text-body-sm` | `DESIGN.md`: nama tempat ditulis persis seperti operator menulisnya |
| 4 | **Kaki perjalanan** (ikon, kode, nama, asal ke tujuan kaki, durasi kaki) | 13 px baris utama, 12 px baris detail | `text-body-sm` / `text-meta` | `DESIGN.md` §"Leg list" |
| 5 | **Tarif** | 16 px jumlah, 12 px operator dan catatan | `text-h3` / `text-meta` | `DESIGN.md` §"The fare block" |
| 6 | **Catatan gangguan** | 13 px judul, 12 px isi | `text-body-sm` / `text-meta` | `DESIGN.md`: "A closed line is the loudest thing on the screen" |

Aturan yang mengikat:

- **Hanya satu elemen boleh sebesar 40 px per panel.** NN/g memberi batas atas
  dua; untuk panel hasil rute kita tetapkan satu.
- **Urutan harus konsisten dalam satu panel.** Durasi selalu di kiri atas,
  jarak selalu di bawahnya. Tidak boleh ada state di mana "15,2 km" muncul
  sebelum "1 jam 9 mnt".
- **Angka selalu `tabular-nums`:** durasi, jarak, jumlah halte, tarif, jam.
  Tanpa itu, kolom angka berderet dan tidak bisa dibandingkan.
- **Gangguan, jika ada, berada di atas itinerary,** bukan di bawah. Penumpang
  yang melewatinya akan salah rute.

### 3.2 Cara menampilkan beberapa alternatif: tab atau daftar

**Keputusan: daftar, bukan tab.**

| | Tab (sekarang) | Daftar (usulan) |
| --- | --- | --- |
| Perbandingan | Tersembunyi; pindah tab untuk melihat | Terlihat; semua alternatif berdampingan |
| Label | Bisa meniru nama (kode jalur) | Wajib menyebut tujuan optimasi |
| Selisih angka | Hanya pada baris pertama | Selisih waktu dan selisih pindah di setiap baris |
| Biaya interaksi | Dua klik per alternatif | Nol klik untuk membandingkan, satu klik untuk memilih |

Google Maps memakai `routeLabels` per rute
([Routes API](https://developers.google.com/maps/documentation/routes/alternative-routes)),
dan TfL Go menomori alternatif menurut tujuan optimasi
([TfL Go](https://apps.apple.com/gb/app/tfl-go-plan-pay-travel/id1419541638)).
Keduanya bisa dibandingkan; tab tidak bisa.

Bentuk yang disarankan:

```
+----------------------------------------------+
| PERJALANAN                                   |  <- eyebrow 12 px uppercase
| 1 jam 9 mnt                                  |  <- 40 px
| 15,2 km . 2 kali pindah                      |  <- 13 px
+----------------------------------------------+
| Alternatif lain                              |  <- 12 px, disclosure
+----------------------------------------------+
| Tercepat                1 jam 9 mnt          |  <- 13 px + 13 px tabular
| Rekomendasi             1 jam 17 mnt . +8 mnt |
| Paling sedikit pindah  1 jam 24 mnt . +15 mnt|
+----------------------------------------------+
```

Aturan tambahan:

- **Maksimal tiga alternatif** yang terlihat. Lebih dari itu, perbedaan
  menjadi tidak terasa dan tabel berubah menjadi bising.
- **Alternatif yang aktif ditandai, bukan disembunyikan.** Baris aktif
  mendapat `background: var(--surface-2)` dan `border-left: 2px var(--accent)`.
- **Selisih selalu ditulis sebagai trade-off, bukan sebagai angka tunggal.**
  "+15 mnt" saja menyembunyikan bahwa mungkin perpindahannya berkurang satu.
  Bentuk: "+15 mnt . 1 pindah lebih banyak" atau "+6 mnt . 1 pindah lebih sedikit".
- **Rincian alternatif bisa dibuka tanpa memuat ulang.** journeys yang sama,
  isi yang berbeda.

### 3.3 Label alternatif

Tiga label, tiga tujuan optimasi, tidak lebih:

| Label | Kapan dipakai | Teks tambahan |
| --- | --- | --- |
| **Tercepat** | Rute dengan durasi terpendek | — |
| **Paling sedikit pindah** | Rute dengan jumlah perpindahan paling sedikit | "+6 mnt . 1 pindah lebih banyak" |
| **Rekomendasi** | Rute dengan biaya terendah menurut planner (waktu, jarak, dan pindah dinilai bersama) | "+8 mnt . 2 perpindahan lebih sedikit" |

Yang **tidak** boleh dipakai sebagai label:

- Nomor urut ("Rute 1", "Alternatif 2") — tidak memberi informasi.
- Kode jalur ("9D . 4C") — itu isi, bukan alasan. Kode jalur sudah muncul
  di dalam baris kaki perjalanan.
- Kata sifat ("Terbaik", "Optimal", "Ekonomis") — tidak bisa diuji dan
  terdengar seperti copy pemasaran. `DESIGN.md` melarang marketing copy.

Rujukan: NN/g "Make the most important element biggest" dan Google Maps
`routeLabels` — keduanya melabeli rute menurut **tujuan optimasi**, bukan
menurut indeks.

### 3.4 Urutan di dalam satu kaki perjalanan

Satu baris kaki perjalanan harus terbaca dalam urutan ini:

1. **Ikon moda** 16 px dalam lingkaran 32 px di kiri — moda terbaca sebelum
   kata.
2. **Kode jalur** 12 px mono di atas tint 12 persen warna mode.
3. **Nama jalur atau nama layanan** 13 px semibold — contoh "MRT Jakarta",
   "Transjakarta 9D".
4. **Asal ke tujuan kaki** 13 px, nama tempat dipotong dengan ellipsis dan
   `title` penuh untuk aksesibilitas.
5. **Durasi kaki** 13 px tabular, rata kanan — tidak pernah turun ke baris
   bawah pada layar sempit, karena kolom kanan harus selalu sejajar.

Baris kedua (12 px `text-meta`) memuat jumlah perhentian, jarak, dan waktu
tunggu. Baris ini **hanya** muncul kalau kaki punya lebih dari dua
perhentian; kalau tidak, kaki itu cukup satu baris.

---

## 4. Tipografi dan spacing

### 4.1 Skala tipografi final

Sembilan langkah. Setiap angka punya alasan yang bisa ditelusuri; tidak ada
ukuran yang dipilih karena "terlihat bagus".

| Token | px | rem | line-height | weight | tracking | Pemakaian |
| --- | --- | --- | --- | --- | --- | --- |
| `text-display` | 40 | 2.5 | 1.05 (42 px) | 700 | −0.03em | Durasi perjalanan. Satu-satunya angka besar di panel |
| `text-h1` | 28 | 1.75 | 1.2 (34 px) | 700 | −0.025em | Judul panel dan judul halaman |
| `text-h2` | 20 | 1.25 | 1.3 (26 px) | 600 | −0.02em | Judul bagian di dalam kartu ("Tarif", "Perjalanan") |
| `text-h3` | 16 | 1 | 1.35 (22 px) | 600 | −0.01em | Nama jalur, nama tempat, jumlah tarif |
| `text-body` | 15 | 0.9375 | 1.55 (23 px) | 400 | 0 | Teks isi, baris detail kaki perjalanan, isi form |
| `text-body-sm` | 13 | 0.8125 | 1.5 (20 px) | 400 | 0 | Daftar halte, catatan kaki, meta itinerary |
| `text-label` | 12 | 0.75 | 1.35 (16 px) | 600 | +0.04em | Label field dan eyebrow uppercase |
| `text-meta` | 12 | 0.75 | 1.45 (17 px) | 500 | 0 | Timestamp, atribusi, sumber, stempel waktu |
| `text-code` | 12 | 0.75 | 1.2 (14 px) | 500 | +0.01em | Kode halte dan kode jalur, JetBrains Mono |

Aturan tambahan:

- **Lantai 12 px.** Tidak ada teks di bawah 12 px, termasuk catatan, badge,
  dan kode. Bandingkan Apple HIG: `Caption 2` 11 px adalah batas bawah sistem
  Apple untuk label dekoratif; 12 px adalah `Caption 1` dan dipakai sebagai
  teks yang dibaca ([HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)).
- **Tidak ada 14 px.** Skala ini sengaja menyisipkan 13 px di antara 12 dan 15.
  14 px dan 15 px berdiri terlalu dekat untuk membedakan dua tingkat
  hierarki, sedangkan 13 dan 15 berdiri cukup jauh. Skema NSW juga memakai
  14 px sebagai *kecil* dan 16 px sebagai *body*, jadi 13 px untuk daftar
  padat adalah pilihan yang berdiri sendiri dan bisa dipertanggungjawabkan.
- **Tracking hanya di dua tempat:** negatif untuk display dan heading
  (−0.03em sampai −0.01em), positif untuk label uppercase (+0.04em) dan kode
  (+0.01em). Carbon memakai tracking 0,32 px pada 12 px dan 0,16 px pada
  14 px — arah yang sama ([Carbon type sets](https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets)).
- **Line-height turun seiring ukuran naik:** 1.05 pada 40 px, 1.55 pada 15 px.
  Ini persis pola Apple (34/41 = 1,21 pada large title, 17/22 = 1,29 pada body),
  hanya diperketat karena aplikasi ini memakai label yang lebih rapat.
- **`font-weight` hanya empat: 400, 500, 600, 700.** Tanpa 300 (terlalu tipis
  di bawah terik) dan tanpa 800 (terlalu keras untuk teks membaca).
- **Eyebrow uppercase hanya berisi kata kiasan** ("PERJALANAN", "TARIF",
  "RUTE"), tidak pernah nama tempat. `BUNDARAN HI ASTRA` yang uppercase
  menghapus nama diri; nama diri adalah data, dan data ditulis apa adanya.

### 4.2 Panjang baris

| Metric | Nilai | Sumber |
| --- | --- | --- |
| Lebar kolom kiri desktop | `minmax(380px, 440px)` | `DESIGN.md` §Layout |
| Panjang baris pada 15 px | 48 sampai 52 karakter | Turunan dari lebar kolom |
| Batas nyaman umum | 45 sampai 75 karakter | Panduan tipografi umum |
| Garis pemisah | 1 px `--line` | `DESIGN.md` §Radius |

Aturan: `text-wrap: balance` hanya untuk heading satu baris; `text-wrap:
pretty` untuk paragraf; **jangan pernah justify** (menghasilkan rivers di
Bahasa Indonesia, yang punya banyak kata satu dan dua suku kata).

### 4.3 Angka

- **Semua angka yang dibandingkan memakai `tabular-nums`:** durasi, jarak,
  jumlah perhentian, jumlah pindah, tarif, jam, nomor halte.
- Angka yang **tidak** perlu tabular: nomor urut di dalam daftar statis, dan
  angka di dalam nama orang atau nama jalan ("Jalan Abdul Rachman").
- `font-feature-settings` memuat `"tnum"` untuk mono, dan `tabular-nums`
  sebagai kelas utility untuk teks sans.

### 4.4 Skala spasi

Basis 4 px. Tidak ada nilai di luar daftar ini kecuali hairline 1 px dan
setengah langkah yang hanya dipakai untuk jarak optis di dalam satu komponen.

| Token | px | Pemakaian |
| --- | --- | --- |
| `space-0` | 0 | — |
| `space-px` | 1 | Garis pemisah |
| `space-1` | 4 | Padding dalam chip |
| `space-2` | 8 | Jarak ikon dan teks, padding baris rapat |
| `space-3` | 12 | Jarak antar baris kaki, padding vertikal baris |
| `space-4` | 16 | Padding kartu, padding ponsel |
| `space-5` | 20 | Padding atas panel |
| `space-6` | 24 | Jarak antar blok di kolom kiri, padding panel |
| `space-8` | 32 | Padding bawah panel |
| `space-10` | 40 | — |
| `space-12` | 48 | Padding state kosong |
| `space-16` | 64 | — |

Carbon memakai skala yang sama dengan basis 8 px dan unit mini 2 px
([Carbon spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview));
Shopify Polaris memakai basis 4 px dengan langkah 4 sampai 32
([Polaris tokens](https://github.com/Shopify/polaris-tokens)). Kita
memakai basis 4 px dengan langkah 2 dan 1 sebagai pengecualian hairline.

**Aturan ritme:** jarak di dalam kelompok kecil, jarak lebih besar di antara
kelompok. 12 px di dalam satu kaki perjalanan, 24 px antar blok utama,
12 px padding vertikal baris kaki.

### 4.5 Kepadatan panel kiri

| Elemen | Desktop | Ponsel |
| --- | --- | --- |
| Lebar kolom | 380 sampai 440 px | Penuh |
| Padding panel | 24 px | 16 px |
| Jarak antar blok | 24 px | 16 px |
| Padding kartu | 16 px | 16 px |
| Padding baris kaki | 12 px | 12 px |
| Tinggi minimum baris kaki | 56 px | 64 px |
| Tinggi baris daftar halte | 32 px | 32 px |
| Tinggi input | 44 px | 48 px |
| Ukuran huruf input | 15 px | 16 px (agar iOS tidak memperbesar layar) |
| Target sentuh | 32 px | 44 px |
| Lebar baris teks | 48 sampai 52 karakter | 32 sampai 40 karakter |

### 4.6 Radius

| Token | px | Pemakaian |
| --- | --- | --- |
| `radius-xs` | 3 | Sorotan submencocokan, titik kecil |
| `radius-sm` | 6 | Tombol ikon, kontrol peta, popover peta |
| `radius-md` | 10 | Tombol, input, chip |
| `radius-lg` | 14 | Kartu, panel itinerary |
| `radius-xl` | 18 | Bottom sheet, dialog |
| `radius-full` | 9999 | Pil, avatar, penanda peta |

**Maksimal tiga nilai radius terlihat bersamaan dalam satu layar.** Radius
mengikuti ukuran permukaan: kartu 14 px, chip 6 sampai 10 px, titik penuh.
Kartu tidak pernah memakai radius penuh.

---

## 5. Microcopy bahasa Indonesia

Bagian ini adalah yang paling sering dilewati di aplikasi transit, dan
justru paling menentukan apakah produk terasa "dari sini" atau "aplikasi
asing yang diterjemahkan".

### 5.1 Istilah tempat: "halte" atau "stasiun"

Dasar hukumnya jelas dan singkat:

> "Halte adalah tempat pemberhentian Kendaraan Bermotor Umum untuk menaikkan
> dan menurunkan penumpang." — UU 22/2009, dikutip pada
> [JDIH Kementerian Keuangan](https://jdih.kemenkeu.go.id/kamus-hukum/halte?id=10d118b2ba587e83e1654a25a8648367)
> dan [Kamus BPIW Kementerian PU](https://bpiw.pu.go.id/bankdata/dictionary/words?q=Halte&id=591)

Artinya: **halte adalah tempat pemberhentian bus.** Kereta punya *stasiun*;
perhentian kereta yang lebih kecil sering disebut *halte* atau *perhentian*
([Wikipedia: Stasiun kereta api](https://id.wikipedia.org/wiki/Stasiun_kereta_api)).

 Bukti lebih dekat dari operator sendiri:

| Operator | Istilah yang dipakai | Bukti |
| --- | --- | --- |
| **Transjakarta** | **halte** | "Halte BRT Senen", "Halte Bundaran HI Astra", "Halte Senayan Bank DKI" ([Wikipedia Transjakarta](https://id.wikipedia.org/wiki/Transjakarta)); layanan di situs resmi: "Angkutan Pengumpan", "Mikrotrans" ([transjakarta.co.id](https://www.transjakarta.co.id/)) |
| **MRT Jakarta** | **stasiun** | "Stasiun MRT Lebak Bulus", "Stasiun MRT Blok M BCA" ([Wikipedia LRT Jabodebek](https://id.wikipedia.org/wiki/LRT_Jabodebek), tabel "Stasiun MRT Jakarta") |
| **LRT Jakarta** | **stasiun** | Situs resmi: "Stasiun Velodrome", "Pos SAPA di setiap stasiun" ([lrtjakarta.co.id](https://lrtjakarta.co.id/)) |
| **LRT Jabodebek** | **stasiun** | 18 titik layanan bernama "Stasiun" ([Wikipedia LRT Jabodebek](https://id.wikipedia.org/wiki/LRT_Jabodebek)) |
| **KRL / KAI** | **stasiun** | Tidak terverifikasi langsung (situs kci.id tidak merespons — bagian 11); Wikipedia memakai "Stasiun" |
| **Terminal** | **terminal** | "Terminal adalah pangkalan kendaraan bermotor umum yang digunakan untuk mengatur kedatangan dan keberangkatan" (PP 79/2013, PP 30/2021, PP 74/2014, UU 22/2009 — [JDIH Kemenkeu](https://jdih.kemenkeu.go.id/kamus-hukum/halte?id=10d118b2ba587e83e1654a25a8648367)) |

**Aturan yang harus dipakai di aplikasi:**

```
stopNoun(mode, name) =
  "Stasiun " + name     bila moda adalah MRT, LRT Jakarta, LRT Jabodebek, atau KRL
  "Halte " + name       bila moda adalah bus (Transjakarta dan turunannya)
  name                  bila nama sudah memuat kata "Stasiun" atau "Halte"
```

Nama yang sudah memuat kata itu **tidak** boleh digandakan. Kode sekarang
selalu menambah "halte" apa pun modanya; itu sebabnya nama halte MRT
menjadi "halte MRT Lebak Bulus" di panel berjalan kaki.

### 5.2 Istilah lain

| Konsep | Istilah yang dipakai | Sumber |
| --- | --- | --- |
| Angkutan darat | **kendaraan** atau **layanan** | "Kendaraan Bermotor Umum" (UU 22/2009) |
| Kenaikan dan penurunan penumpang | **naik** dan **turun** (bukan "board"/"alight") | Bahasa Indonesia baku |
| Kelas layanan bus | **BRT**, **Angkutan Pengumpan**, **Metrotrans**, **Royaltrans**, **Minitrans**, **Mikrotrans** | [transjakarta.co.id](https://www.transjakarta.co.id/); PM 15/2019 memakai "Angkutan Pengumpan" dan "Trayek Pengumpan" |
| Berpindah moda | **pindah kendaraan** atau **pindah** | Istilah yang dipakai penumpang adalah "ganti" atau "pindah" |
| Biaya | **tarif** (bukan "harga", bukan "biaya") | [Jaklingko Indonesia](https://jaklingkoindonesia.co.id/): "Tarif Integrasi" |
| Perjalanan | **perjalanan** | Dipakai di "Tidak ada perjalanan yang terhubung" |
| Sistem pembayaran | **tap in** dan **tap out**; sistemnya **Account Based Ticketing** | Istilah "tap in" dipakai dalam dokumen integrasi resmi ([ITDP Indonesia](https://itdp-indonesia.org/wp-content/uploads/2020/03/2.-Desain-Integrasi-Station-Transjakarta-MRT-LRT-1.pdf)); "Account Based Ticketing (ABT)" dipakai Jaklingko |
| Integrasi antarmoda | **Integrasi** untuk tarif; **integrasi multimodal** untuk jaringan | Jaklingko: "Tarif Integrasi"; dokumen integrasi resmi: "Desain Integrasi Stasiun Transjakarta-MRT-LRT" |
| Gangguan | **penutupan**, **pengalihan rute**, **keterlambatan**, **perubahan layanan**, **pemeliharaan**, **mogok** | Sudah dipakai di `apps/web/src/lib/format.ts`; urutan keparahan dijaga |

**"Integrasi" dan "integrasi multimodal" bukan sinonim yang bisa dipakai
bergantian.** Yang pertama merujuk pada satu tiket dan satu tarif
(`Tarif Integrasi`); yang kedua merujuk pada jaringan yang saling
terhubung secara fisik (skywalk, peron menyambung). Di UI, yang ditampilkan
adalah yang pertama.

### 5.3 Ejaan bahasa Indonesia di antarmuka

| Aturan | Benar | Salah | Sumber |
| --- | --- | --- | --- |
| **Angka ribuan** | `15.200` | `15,200` | PUEBI III.A.5 |
| **Angka desimal** | `15,2 km` | `15.2 km` | PUEBI II.I.4 (`0,5 sentimeter`) |
| **Waktu** | `10.14 WIB` | `10:14 WIB` | PUEBI III.A.3: "pukul 01.35.20" |
| **Rupiah** | `Rp5.000` | `Rp 5.000`, `Rp.5000`, `Rp5.000,-` | PUEBI II.H.5: lambang mata uang melekat pada angka, tanpa tanda titik |
| **Imiah** | `2 kali pindah` | `2x Pindah`, `2 x pindah` | Angka + kata kerja; PUEBI tidak mengizinkan huruf "x" sebagai pengali dalam teks |
| **Kapitalisasi kalimat** | `Cari rute` | `CARI RUTE` sebagai judul | PUEBI: kapitalisasi kalimat kecuali pada kondisi tertentu |
| **Kapitalisasi nama diri** | `Stasiun MRT Lebak Bulus` | `STASIUN MRT LEBAK BULUS` | PUEBI: nama diri dikapitalkan, bukan diubah jadi huruf besar |
| **Huruf kapital di awal** | `Dari`, `Ke` | `DARI`, `KE` | Sama |
| **Singkatan** | `MRT`, `LRT`, `KRL`, `BRT`, `Rp`, `km`, `mnt` | `Mrt`, `Krl`, `Rp.` | PUEBI: akronim nama diri ditulis seluruhnya huruf kapital tanpa titik |
| **Nama operator** | `Transjakarta` (satu kata) | `Trans Jakarta` | Penulisan resmi PT Transportasi Jakarta |
| **Angka di dalam teks** | `2 tahun 6 bulan`, `1 jam 20 menit` | `2 th 6 bln` | PUEBI II.I.4 |
| **Bulan** | `Jan, Feb, Mar, Apr, Mei, Jun, Jul, Agu, Sep, Okt, Nov, Des` | `Agustus` dalam tanggal ringkas, `Sept` | PUEBI: singkatan bulan |
| **Tanda seru** | tidak ada | `Cari rute!` | `DESIGN.md`: "No exclamation marks" |
| **Em-dash** | koma atau titik | `Rute — tercepat` | Bahasa Indonesia; tanda hubung panjang bukan tanda baca baku |
| **Emoji** | tidak ada | `🚌` | `AGENTS.md`: "No emoji anywhere in code, markup, or copy" |

### 5.4 Aturan copy sebelum dan sesudah

Lima belas aturan, semuanya terikat pada berkas nyata di `apps/web/src`.

| # | Sebelum | Sesudah | Alasan |
| --- | --- | --- | --- |
| 1 | `Berjalan kaki ke halte ${toName}` | `Berjalan kaki ke ${Stasiun\|Halte} ${toName}` | Istilah mengikuti moda (§5.1) |
| 2 | `{leg.stops.length} halte` | `{n} {stasiun\|halte}` | Jumlah perhentian di kereta bukan "halte" |
| 3 | `Berjalan kaki dari halte ${fromName}` | `Berjalan kaki dari ${Stasiun\|Halte} ${fromName}` | Sama |
| 4 | `Perkiraan tarif` | `Tarif` | Tarif yang dipublikasikan bukan perkiraan |
| 5 | `tunggu ±${waitMinutes} mnt` | `tunggu ${waitMinutes} mnt` | Tanda plus-minus bukan kebiasaan pembaca |
| 6 | `"Jalan kaki"` (judul kaki) | `"Berjalan kaki"` | Bentuk kata kerja yang sama dengan kalimatnya |
| 7 | `Transjakarta, MRT, LRT Jakarta, LRT Jabodebek, dan KRL.` | Dihapus dari deskripsi kartu | Daftar operator sudah ada di legenda peta; deskripsi kartu harus memberi tahu apa yang harus diketik |
| 8 | `Coba nama tempat yang lebih spesifik, misalnya halte terdekat dengan nama jalan.` | `Coba nama halte yang lebih spesifik, misalnya Halte Bundaran HI.` | Kalimat lama tidak masuk akal dan tidak memberi contoh yang bisa diklik (NN/g: "Provide direct pathways") |
| 9 | `Tidak ada rute terhubung` | `Tidak ada perjalanan yang terhubung` | Frasa yang lebih natural; "perjalanan" adalah kata kunci penumpang |
| 10 | `Data per ${timestamp}` | `Terakhir dihitung ${timestamp} WIB` | Menyebutkan waktu mutlak dan zona waktu |
| 11 | `Rute tercepat` (judul tab) | `Tercepat` | Judul tab dan isinya tidak boleh berbeda |
| 12 | `Alternatif` (label tab) | `Paling sedikit pindah` / `Rekomendasi` | Label harus menyebut tujuan optimasi (§3.3) |
| 13 | `${transferCount} kali pindah` | **tetap** | Sudah benar; jangan jadi "2x Pindah" |
| 14 | `toLocaleString("id-ID")` | **tetap** | Pemisah ribuan titik dan desimal koma |
| 15 | `Rp 5.000` | `Rp5.000` | PUEBI II.H.5 |

Aturan 13 dan 14 sengaja tercatat sebagai "tetap": aturan copy bukan
sekadar daftar larangan, tapi juga daftar yang harus dijaga.

---

## 6. Pola UI yang terbukti baik

### 6.1 Memuat: tidak pernah kosong

Aturan: **rute sebelumnya tidak boleh hilang saat rute baru dihitung.**
Rute yang sudah dihitung tetap berguna walau data disruption yang baru belum
masuk.

| Aturan | Nilai |
| --- | --- |
| Indikator | Garis progres 2 px di tepi atas panel itinerary, `transform: scaleX()`, 240 ms linear |
| ARIA | `aria-busy="true"` pada panel itinerary, `aria-live="polite"` untuk pengumuman "Menghitung rute" |
| Ambang lambat | 3 detik, lalu teks "Perhitungan lambat. Menyederhanakan…" |
| Larangan | Spinner penuh yang menghapus jawaban; shimmer; titik status yang berdenyut |
| Skeleton | Hanya untuk permukaan yang belum pernah termuat (kunjungan pertama), tidak untuk mengganti data yang sudah ada |

Carbon merujuk riset Nielsen Norman Group bahwa skeleton state dan loading
indicator memperbaiki kepuasan pengguna
([Carbon loading pattern](https://v10.carbondesignsystem.com/patterns/loading-pattern)).
Skeleton yang **menggantikan** hasil yang sudah ada justru kebalikannya: ia
menghapus informasi yang tidak perlu dihapus.

### 6.2 Keadaan kosong: satu contoh yang bisa diklik

NN/g: "Do not default to totally empty states"; "Use Empty States to Provide
Learning Cues"; "Provide direct pathways (i.e., links) to getting started"
([NN/g](https://www.nngroup.com/articles/empty-state-interface-design)).

Empat keadaan kosong, masing-masing berisi **status + satu jalan keluar**:

| Keadaan | Isi | Jalan keluar |
| --- | --- | --- |
| Belum ada rute | "Belum ada rute" + "Pilih asal dan tujuan untuk melihat perjalanan." | Satu contoh yang bisa diklik: `Bundaran HI → Kota Tua` |
| Menghitung | Rute lama tetap terlihat | Garis progres 2 px |
| Tidak ada hasil | "Tidak ada perjalanan yang terhubung" + nama asal dan tujuan yang diketik | "Coba nama halte yang lebih spesifik, misalnya Halte Bundaran HI." |
| Gangguan data | Rute tetap tampil + catatan sumber yang bermasalah | "Periksa pengumuman operator." |

Larangan: ilustrasi orang yang sedang menunggu, blob gradien, teks "Tidak
ada data", dan ilustrasi placeholder. Padding minimal 48 px.

### 6.3 Keadaan galat: dekat titik kegagalan

NN/g: pesan galat harus muncul di dekat tempat kegagalan, bukan di atas
layar sebagai banner global
([NN/g Cancel vs Close](https://www.nngroup.com/articles/cancel-vs-close)).

| Yang | Contoh |
| --- | --- |
| Penyebab | "Tempat tidak ditemukan atau terlalu ambigu." |
| Pemulihan | "Coba nama halte yang lebih spesifik, misalnya Halte Bundaran HI." |
| Contoh yang bisa diklik | Nama halte nyata dari data |
| Larangan | "Terjadi kesalahan. Silakan coba lagi." |

### 6.4 Progressive disclosure untuk daftar halte

- Ringkasan pada `<summary>` harus menyebut **bentuk** perjalanan, bukan
  daftar: "12 halte · 4,2 km · tunggu 5 mnt".
- Maksimal **dua tingkat** disclosure. Riset NN/g menemukan desain dengan lebih
  dari dua tingkat menunjukkan kegunaan yang lebih rendah.
- Daftar perhentian memakai **rel timelines**, bukan bullet: nama perhentian
  13 px, menit tempuh 12 px mono rata kanan.
- Menyorot satu perhentian di daftar menyorot perhentian yang sama di peta
  (sudah berjalan: `onStopHover`).

### 6.5 Tooltip atau popover

| | Tooltip | Popover |
| --- | --- | --- |
| Isi | Label singkat untuk mengidentifikasi kontrol | Penjelasan, boleh berisi tautan atau tombol |
| Pemicu di desktop | Hover, delay 250 ms | Klik |
| Pemicu di ponsel | Tap | Tap |
| Isi interaktif | Tidak pernah | Boleh |
| Bentuk | 12 px, radius 6 px, satu-dua baris, `shadow-pop` | 13 px, radius 10 px, ada tombol tutup |

Red Hat merumuskan pembagiannya persis seperti ini: "Popovers are used for
added description or information in context whereas tooltips are used for
identification purposes" ([Red Hat design system](https://ux.redhat.com/elements/popover/guidelines)).

Aturan tambahan: **tooltip tidak pernah menjadi satu-satunya salinan dari
sebuah informasi**; `aria-label`always membawa teks yang sama. Popover titik
di peta hanya berisi nama tempat dan kendaraan yang melayaninya — durasi dan
tarif milik itinerary, bukan peta.

### 6.6 "Undo" atau "confirm"

| Situasi | Pola |
| --- | --- |
| Reversibel dan rutin | Lakukan, lalu tawarkan **undo** (toast, 5 sampai 8 detik) |
| Tidak reversible dan merusak | **Dialog konfirmasi** dengan kalimat spesifik |
| Rutinitas | **Tidak boleh** memakai dialog konfirmasi |

NN/g: "Do not use confirmation dialogs for routine actions. Like in Aesop's
fable, if you cry wolf too many times, people will stop paying attention"
([NN/g Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog)).

Untuk Daily Route hampir tidak ada aksi merusak. Kandidat satu-satunya —
"hapus riwayat pencarian" dan "tukar asal dengan tujuan" — keduanya
reversible atau sepele. **Jadi: tidak ada dialog konfirmasi sama sekali.**
Menukar asal dan tujuan tidak butuh konfirmasi; itu aksi yang selalu bisa
dibatalkan dengan menekan lagi.

### 6.7 Focus management

| Kejadian | Fokus |
| --- | --- |
| Hasil rute muncul | Pindah ke judul itinerary (`tabindex="-1"`) dan diumumkan ke pembaca layar |
| Alternatif dipilih | Fokus **tetap** di kontrol yang dipilih; jangan direbut |
| Sheet ditutup | Fokus kembali ke pemicunya |
| Combobox saran | Fokus **tidak pernah** keluar dari input; `aria-activedescendant` menunjuk opsi aktif |
| Gangguan baru masuk | Diumumkan lewat `aria-live="polite"`, tanpa memindahkan fokus |

Cincin fokus: outline 2 px warna aksen, offset 2 px, tidak pernah dihapus.

### 6.8 "Gunakan posisi saya"

Pola yang dipakai: **kontrol di dalam field, izin diminta setelah tombol
ditekan, penolakan dijelaskan di bawah field.**

| Aturan | Nilai |
| --- | --- |
| Letak | Trailing action di dalam field "Dari" (bukan tombol mengambang di peta) |
| Ikon | `LocateFixed` 16 px, tombol 28 px desktop dan 44 px ponsel |
| Label | `aria-label="Gunakan posisi saya"` + tooltip yang sama |
| Saat izin diminta | **Hanya setelah** pengguna menekan tombol; tidak pernah saat halaman dibuka |
| Priming | Tooltip atau teks helper menjelaskan gunanya sebelum prompt sistem muncul |
| Jika ditolak | Satu baris di bawah field: "Lokasi tidak diizinkan. Ketuk nama halte untuk mengetik." Tidak ada dialog, tidak ada permintaan ulang |
| Jika lokasi kasar | Tetap dihitung, dan panel berjalan kaki menyebut "lokasi perkiraan" |
| Di peta | Titik asal tetap memakai warna aksen, bukan warna moda |

Referensi pola: permission priming membuat persetujuan lebih mungkin terjadi
karena permintaan tidak datang sebagai hal yang tak terduga
([UserOnboard](https://www.useronboard.com/onboarding-ux-patterns/permission-priming)).

---

## 7. Audit antarmuka Daily Route sekarang

Diperiksa langsung dari `apps/web/src` pada 21 Oktober 2026. Kolom **Files** menunjuk berkas dan baris tempat temuan itu ada.

### 7.1 Yang sudah benar dan harus dipertahankan

| Yang | Bukti |
| --- | --- |
| Durasi sebagai judul 40 px | `route-planner.tsx:214` |
| `tabular-nums` pada durasi, jarak, jumlah pindah, durasi kaki | `route-planner.tsx:214`, `route-planner.tsx:217`, `leg-list.tsx:140` |
| Eyebrow uppercase dengan tracking | `route-planner.tsx:211` (tapi ukurannya salah, lihat 7.2) |
| Kartu tanpa bayangan, border 1 px | `card.tsx:23` |
| Radius 14 px hanya pada kartu | `styles.css:64`, `card.tsx:23` |
| Peta tiga lapis: halo, casing, garis | `route-map.tsx` |
| Legenda baris tipis tanpa bayangan, tanpa pointer | `index.tsx:296` |
| Gangguan di atas itinerary | `route-planner.tsx:175-181` |
| Copy walking kaki yang menyebut tujuannya | `leg-list.tsx:238-251` |
| Tidak ada emoji, tidak ada tanda seru di copy | seluruh `apps/web/src` |
| Combobox dengan `aria-activedescendant` | `place-input.tsx` |

### 7.2 Tabel audit: apa yang berubah dan kenapa

| # | Temuan | Files | Setelah | Kenapa |
| --- | --- | --- | --- | --- |
| 1 | Eyebrow berisi **nama tempat** dan di-uppercase | `route-planner.tsx:211` | Eyebrow berisi kata kiasan "PERJALANAN" 12 px; nama asal dan tujuan 13 px sentence-case di bawahnya | Nama diri adalah data; uppercase menghapusnya. §5.3 |
| 2 | Ukuran 11 px, di bawah lantai | `route-planner.tsx:211,232`; `__root.tsx:36,43`; `place-input.tsx:312`; `disruption-banner.tsx:47` | 12 px (`text-meta`) | Lantai 12 px. §4.1 |
| 3 | Ukuran 10 px | `place-input.tsx:321,328`; `chat-panel.tsx:73` | 12 px | Lantai 12 px |
| 4 | Ukuran 14 px (`text-sm`, `text-[14px]`) | `route-planner.tsx:239`; `place-input.tsx:303`; `leg-list.tsx:52` | 13 px (`text-body-sm`) atau 15 px (`text-body`) | 14 dan 15 terlalu dekat untuk dua tingkat hierarki |
| 5 | "Perkiraan tarif" | `route-planner.tsx:238` | "Tarif" | Tarif yang dipublikasikan bukan perkiraan. §5.4 aturan 4 |
| 6 | "Data per {timestamp}" | `route-planner.tsx:233` | "Terakhir dihitung 21 Okt 2026, 10.14 WIB" | Menyebut waktu mutlak dan zona waktu. §5.4 aturan 10 |
| 7 | `formatTimestamp` mengganti titik dengan titik dua | `format.ts:117` | Biarkan titiknya; tambahkan " WIB" | PUEBI III.A.3. §5.3 |
| 8 | "Tidak ada rute terhubung" | `route-planner.tsx:167` | "Tidak ada perjalanan yang terhubung" | Frasa yang lebih natural. §5.4 aturan 9 |
| 9 | Galat menyebut "halte terdekat dengan nama jalan" | `route-planner.tsx:158` | "Coba nama halte yang lebih spesifik, misalnya Halte Bundaran HI." + contoh yang bisa diklik | Kalimat lama tidak masuk akal dan tidak memberi jalan keluar. §6.2 |
| 10 | Deskripsi kartu mendaftarkan operator | `route-planner.tsx:79` | Dihapus; ganti dengan petunjuk singkat apa yang harus diketik | Daftar operator sudah ada di legenda peta. §5.4 aturan 7 |
| 11 | Alternatif memakai tab | `route-planner.tsx:183-200` | Daftar perbandingan dengan maksimal tiga baris | Tab menyembunyikan perbandingan. §3.2 |
| 12 | Label alternatif menyalin kode jalur; fallback "Alternatif" | `route-planner.tsx:276-292` | "Tercepat", "Paling sedikit pindah", "Rekomendasi" + selisih sebagai trade-off | Label harus menyebut tujuan optimasi. §3.3 |
| 13 | "paling cepat" (bukan "Tercepat") | `route-planner.tsx:285` | "Tercepat" | Konsistensi kapitalisasi |
| 14 | Judul tab "Rute tercepat" berbeda dengan isinya "Tercepat" | `route-planner.tsx:188` | Keduanya "Tercepat" | Judul dan isi tab tidak boleh berbeda |
| 15 | Jalan kaki selalu menyebut "halte" | `leg-list.tsx:241,243` | "Stasiun" untuk MRT, LRT Jakarta, LRT Jabodebek, KRL | Istilah operator. §5.1 |
| 16 | Jumlah perhentian selalu "halte" | `leg-list.tsx:167,218` | "stasiun" untuk moda rel | Sama |
| 17 | "tunggu ±N mnt" | `leg-list.tsx:168,220` | "tunggu N mnt" | Tanda plus-minus bukan kebiasaan pembaca. §5.4 aturan 5 |
| 18 | Judul kaki "Jalan kaki" | `leg-list.tsx:125`; `index.tsx:74` | "Berjalan kaki" | Bentuk kata kerja. §5.4 aturan 6 |
| 19 | Legenda peta "Berjalan kaki ke halte pertama" | `index.tsx:125-126` | Ikuti moda, sama dengan daftar | Legenda dan daftar satu bahasa |
| 20 | Legenda 11 px | `index.tsx:296` | 12 px | Lantai 12 px |
| 21 | Kode jalur 11 px | `leg-list.tsx:129` | 12 px mono (`text-code`) | `DESIGN.md` §Typography |
| 22 | Kelas layanan 11 px | `leg-list.tsx:136` | 12 px | Lantai 12 px |
| 23 | Chip kode jalur memakai warna moda sebagai warna teks di atas tint 12 % | `leg-list.tsx:130` | Teks `text-ink` di atas tint, warna moda sebagai border 2 px atau titik | Rasio kontras di `ux-visual-language` §2.2 diukur terhadap `--surface`, bukan terhadap latar tint; bentuk baru tidak bergantung pada pengukuran ulang |
| 24 | Radius `rounded-[9px]` | `tabs.tsx:55` | `rounded-md` (10 px) atau `rounded-lg` (8 px) | Radius di luar skala. §4.6 |
| 25 | Setengah langkah spasi: `gap-1.5`, `px-2.5`, `py-1.5`, `mt-1.5`, `gap-2.5`, `py-2.5` | `tabs.tsx`, `tooltip.tsx`, `chat-panel.tsx`, `place-input.tsx`, `walk-panel.tsx`, `__root.tsx`, `disruption-banner.tsx` | 8 px atau 12 px, kecuali jarak optis di dalam satu komponen | Skala 4 px. §4.4 |
| 26 | Bayangan netral hitam pada tab aktif | `tabs.tsx:62` | `rgb(23 21 15 / 0.12)` | `DESIGN.md`: bayangan diberi warna tinta, bukan hitam netral |
| 27 | Heks warna ditulis di dalam komponen | `route-map.tsx:310-316` | Nilai cadangan dipindah ke `styles.css` sebagai token `--map-*`, atau diturunkan dari token yang ada | `AGENTS.md`: "Never write a hex value in a component". Cadangan `#4b4a44` juga **tidak sama** dengan `--ink-2` `#4a4740` |
| 28 | State memuat memakai kartu spinner penuh | `route-planner.tsx:146-152` | Rute lama tetap tampil + garis progres 2 px | §6.1 |
| 29 | State kosong tanpa jalan keluar | `route-planner.tsx:154-171` (aksi `EmptyState.action` tidak pernah diisi) | Satu contoh yang bisa diklik | NN/g "Provide direct pathways". §6.2 |
| 30 | Fokus tidak berpindah ke hasil rute | `route-planner.tsx` | Judul itinerary `tabindex="-1"`, fokus ke sana saat hasil muncul | §6.7 |
| 31 | Tombol lokasi 28 px (`size-7`) | `route-planner.tsx:107` | 32 px desktop, 44 px ponsel | §6.8 |
| 32 | Alternatif dari API tidak punya `stops`, `mode`, `serviceClass` | `apps/api/src/routes/routes.ts:146-163` | Bentuk alternatif harus sama dengan itinerary, atau UI harus menanganinya | `LegList` membaca `leg.stops.length`; payload alternatif akan membuat daftar kaki kosong atau gagal |
| 33 | Label rute di API adalah "paling cepat" / nama jalur | `route-planner.tsx:276-292` | Label dihitung dari tujuan optimasi, bukan dari kode jalur | §3.3 |
| 34 | "Perjalanan" sebagai nama layanan untuk moda yang tidak diketahui | `leg-list.tsx:125` | Nama moda ("Bus", "MRT Jakarta") | "Perjalanan" tidak menjelaskan moda |
| 35 | State kosong "Jarak terlalu dekat untuk dilalui dengan kendaraan umum." | `leg-list.tsx:45` | Copy ini sudah bagus; bungkus dalam `EmptyState` yang sama dengan yang lain agar konsisten | §6.2 |

### 7.3 Ringkasan kuantitatif audit

| Metrik | Sebelum | Sesudah |
| --- | --- | --- |
| Ukuran huruf berbeda di `apps/web/src` | 10, 11, 13, 14, 15, 40 px (6 nilai) | 12, 13, 15, 16, 20, 28, 40 px (7 nilai, semua anggota skala) |
| Ukuran di bawah 12 px | 8 kemunculan | 0 |
| Nilai spasi di luar skala 4 px | 25 kemunculan | 0 (kecuali hairline 1 px) |
| Radius di luar skala | 1 (`rounded-[9px]`) | 0 |
| Heks warna di dalam komponen | 9 | 0 |
| Istilah "halte" yang salah untuk moda rel | 4 lokasi | 0 |
| Copy yang melanggar PUEBI | 3 (waktu, rupiah, imiah) | 0 |
| Jumlah state yang punya jalan keluar | 0 dari 4 | 4 dari 4 |

---

## 8. Spesifikasi angka final

Versi yang bisa dipakai mesin ada di `research/ux-transit-craft.spec.json`.
Bagian ini adalah ringkasannya untuk manusia.

### 8.1 Token tipografi

| Token | px | line-height | weight | tracking | Numerik |
| --- | --- | --- | --- | --- | --- |
| `text-display` | 40 | 1.05 | 700 | −0.03em | ya |
| `text-h1` | 28 | 1.2 | 700 | −0.025em | tidak |
| `text-h2` | 20 | 1.3 | 600 | −0.02em | tidak |
| `text-h3` | 16 | 1.35 | 600 | −0.01em | tidak |
| `text-body` | 15 | 1.55 | 400 | 0 | tidak |
| `text-body-sm` | 13 | 1.5 | 400 | 0 | tidak |
| `text-label` | 12 | 1.35 | 600 | +0.04em | tidak |
| `text-meta` | 12 | 1.45 | 500 | 0 | ya |
| `text-code` | 12 | 1.2 | 500 | +0.01em | ya |

Anggaran skrip: `allowedFontSizesPx` = 40, 28, 20, 16, 15, 13, 12;
`nearScaleFontSizesPx` = 24, 18, 14; `forbiddenFontSizesPx` = 11, 10, 9, 8.

### 8.2 Skala spasi dan radius

| Token | px | | Token | px |
| --- | --- | --- | --- | --- |
| `space-0` | 0 | | `radius-xs` | 3 |
| `space-px` | 1 | | `radius-sm` | 6 |
| `space-1` | 4 | | `radius-md` | 10 |
| `space-2` | 8 | | `radius-lg` | 14 |
| `space-3` | 12 | | `radius-xl` | 18 |
| `space-4` | 16 | | `radius-full` | 9999 |
| `space-5` | 20 | | | |
| `space-6` | 24 | | | |
| `space-8` | 32 | | | |
| `space-10` | 40 | | | |
| `space-12` | 48 | | | |
| `space-16` | 64 | | | |

### 8.3 Ukuran ikon dan target sentuh

| Elemen | px | Sumber |
| --- | --- | --- |
| Ikon mode | 16 | Gambar ikon 16 px dipakai apa adanya, tidak diperbesar |
| Lingkaran mode | 32 | Tiga kanal: ikon + warna + kode |
| Ikon di panel header | 16 | — |
| Tombol ikon desktop | 32 | Target minimum |
| Tombol ikon ponsel | 44 | Target minimum sentuh |
| Baris kaki minimum (desktop) | 56 | `DESIGN.md` |
| Baris kaki minimum (ponsel) | 64 | `DESIGN.md` |
| Input | 44 | `DESIGN.md` |
| Tombol | 32 / 40 / 48 | `sm` / `md` / `lg` |

### 8.4 Gerak

| Properti | Nilai |
| --- | --- |
| Durasi transisi | 150 ms |
| Properti yang boleh dianimasikan | `background-color`, `border-color`, `color`, `transform`, `box-shadow` |
| Properti yang tidak boleh | `top`, `left`, `width`, `height` |
| Kurva | `ease-out`, tanpa `spring` dan tanpa `bounce` |
| Garis progres | 240 ms linear, `scaleX` |
| Kamera peta | `easeTo` 400 ms untuk titik, `fitBounds` 600 ms untuk perjalanan |
| `prefers-reduced-motion` | semua durasi 0,01 ms; tata letak dan informasi tidak berubah |

### 8.5 State

| State | Pemicu | Tampilan | Jalan keluar | ARIA |
| --- | --- | --- | --- | --- |
| Kosong (awal) | belum ada rute | "Belum ada rute" + satu kalimat | Contoh yang bisa diklik: `Bundaran HI → Kota Tua` | — |
| Memuat | sedang menghitung | Rute lama tetap + garis progres 2 px di tepi atas | — | `aria-busy="true"`, `aria-live="polite"` |
| Lambat | lebih dari 3 detik | "Perhitungan lambat. Menyederhanakan…" | — | diumumkan |
| Kosong (hasil) | tidak ada rute terhubung | "Tidak ada perjalanan yang terhubung" + asal dan tujuan yang diketik | "Coba nama halte yang lebih spesifik, misalnya Halte Bundaran HI." | — |
| Galat | permintaan gagal | Pesan di bawah field yang gagal | Contoh yang bisa diklik | `aria-invalid` pada field |
| Gangguan | ada gangguan yang cocok | Banner di atas itinerary: tingkat, jenis, kapan dipublikasikan, sumber | Tautan ke sumber | `aria-live="polite"` |
| Alternatif | lebih dari satu rute | Daftar maksimal tiga baris, label tujuan optimasi | Pilih baris | fokus tetap di kontrol |

### 8.6 Ringkasan copy final

| Necessity | Bentuk final |
| --- | --- |
| Durasi | `1 jam 9 mnt` |
| Jarak | `15,2 km` (koma desimal, titik ribuan) |
| Jarak kecil | `850 m` |
| Jumlah pindah | `2 kali pindah` atau `tanpa pindah` |
| Jumlah perhentian | `12 halte` (bus) atau `8 stasiun` (rel) |
| Tunggu | `tunggu 5 mnt` |
| Tarif | `Rp5.000` |
| Jam | `10.14 WIB` |
| Tanggal | `21 Okt 2026` |
| Stempel | `Terakhir dihitung 21 Okt 2026, 10.14 WIB` |
| Berjalan kaki ke | `Berjalan kaki ke Stasiun MRT Lebak Bulus` |
| Berjalan kaki dari | `Berjalan kaki dari Halte Bundaran Senayan` |
| Pindah | `Pindah ke LRT Jakarta di Stasiun Velodrome` |
| Ganti kendaraan | `Ganti dari Transjakarta 9D di Halte Bundaran HI` |
| Rute alternatif | `Rekomendasi · +8 mnt · 1 pindah lebih sedikit` |
| Tanpa rute | `Tidak ada perjalanan yang terhubung` |

---

## 9. Rujukan

### 9.1 Dokumentasi dan panduan resmi

1. [NSW Design System — Typography](https://designsystem.nsw.gov.au/core/typography)
2. [Digital NSW — Typography (toolkit aksesibilitas)](https://www.digital.nsw.gov.au/delivery/accessibility-and-inclusivity-toolkit/design/typography)
3. [Apple Human Interface Guidelines — Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
4. [Carbon Design System — Spacing](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview)
5. [Carbon Design System — Typography type sets](https://www.carbondesignsystem.com/building-blocks/foundations/typography/type-sets)
6. [Carbon Design System — Loading pattern](https://v10.carbondesignsystem.com/patterns/loading-pattern)
7. [Carbon Design System — Empty states](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states)
8. [Shopify — Polaris tokens](https://github.com/Shopify/polaris-tokens)
9. [Red Hat Design System — Popover guidelines](https://ux.redhat.com/elements/popover/guidelines)
10. [PUEBI — Pedoman Umum Ejaan Bahasa Indonesia](https://repositori.kemendikdasmen.go.id/270/1/PUEBI.pdf)
11. [PUEBI Daring — Angka dan Bilangan](https://ivanlanin.github.io/puebi/kata/angka-dan-bilangan)
12. [PUEBI Daring — Tanda Titik](https://ivanlanin.github.io/puebi/tanda-baca/tanda-titik)
13. [JDIH Kementerian Keuangan — Definisi Halte dan Terminal](https://jdih.kemenkeu.go.id/kamus-hukum/halte?id=10d118b2ba587e83e1654a25a8648367)
14. [Kamus BPIW Kementerian PU — Halte](https://bpiw.pu.go.id/bankdata/dictionary/words?q=Halte&id=591)
15. [Peraturan BPK — PM 15 Tahun 2019 (standar pelayanan bus)](https://peraturan.bpk.go.id/Download/120381/PM_15_TAHUN_2019_Update.pdf)
16. [TfL — Design standards](https://tfl.gov.uk/info-for/suppliers-and-contractors/design-standards)
17. [TfL — Colour Standard (PDF)](https://content.tfl.gov.uk/tfl-colour-standard.pdf)
18. [LTA — Plan Your Journey](https://www.lta.gov.sg/content/ltagov/en/getting_around/public_transport/plan_your_journey.html)
19. [Transport for NSW — Light Rail Stop Design Guideline (PDF)](https://www.transport.nsw.gov.au/system/files/media/documents/2024/Light-Rail-Stop-Design-Guideline.pdf)
20. [W3C — WCAG 2.x Understanding contrast ratio](https://www.w3.org/WAI/WCAG21/Understanding/contrast-ratio.html)
21. [ITDP Indonesia — Desain Integrasi Stasiun Transjakarta–MRT–LRT (PDF)](https://itdp-indonesia.org/wp-content/uploads/2020/03/2.-Desain-Integrasi-Station-Transjakarta-MRT-LRT-1.pdf)

### 9.2 Halaman operator

22. [Transjakarta](https://www.transjakarta.co.id/)
23. [LRT Jakarta](https://lrtjakarta.co.id/)
24. [Jaklingko Indonesia](https://jaklingkoindonesia.co.id/)
25. [Wikipedia — Transjakarta (penamaan halte)](https://id.wikipedia.org/wiki/Transjakarta)
26. [Wikipedia — LRT Jabodebek (daftar stasiun)](https://id.wikipedia.org/wiki/LRT_Jabodebek)
27. [Wikipedia — Stasiun kereta api](https://id.wikipedia.org/wiki/Stasiun_kereta_api)
28. [ITDP Indonesia](https://itdp-indonesia.org/)

### 9.3 Dokumentasi produk asli

29. [MyTransport.SG (App Store)](https://apps.apple.com/sg/app/mytransport-sg/id1306661188)
30. [TfL Go (App Store)](https://apps.apple.com/gb/app/tfl-go-plan-pay-travel/id1419541638)
31. [Citymapper (App Store)](https://apps.apple.com/ke/app/citymapper-your-transport-app/id469463298)
32. [Google — Routes API: Get alternative routes](https://developers.google.com/maps/documentation/routes/alternative-routes)
33. [Seoul Metropolitan Government — New subway app for foreign residents and tourists](https://english.seoul.go.kr/new-subway-app-exclusive-for-foreign-residents-and-tourists)

### 9.4 Nielsen Norman Group dan riset kegunaan

34. [NN/g — Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design)
35. [NN/g — Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog)
36. [NN/g — Cancel vs Close](https://www.nngroup.com/articles/cancel-vs-close)
37. [NN/g — Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition)
38. [NN/g — Usability Guidelines for Accessible Web Design (PDF)](https://media.nngroup.com/media/reports/free/Usability_Guidelines_for_Accessible_Web_Design.pdf)

### 9.5 Opini desainer (hanya untuk alasan, bukan angka)

39. [Pratt IXD — Design Critique: Citymapper](https://ixd.prattsi.org/2026/02/design-critique-citymapper-ios-app)
40. [ModeShift — The Importance of UI/UX in Public Transit Mobile App Design](https://www.modeshift.com/mobile-ui-ux-public-transit-systems)
41. [Smashing Magazine — How To Manage Dangerous Actions In User Interfaces](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces)
42. [UserOnboard — Permission Priming](https://www.useronboard.com/onboarding-ux-patterns/permission-priming)
43. [DesignSystems.one — Shopify Polaris](https://www.designsystems.one/design-systems/polaris)
44. [DesignSystems.surf — Typography System 101](https://designsystems.surf/articles/typography-system-101-a-step-by-step-guide)
45. [Print — Latin and Hangul Find Visual Harmony in Seoul Metro's New Type System](https://www.printmag.com/type-tuesday/latin-hangul-visual-harmony-seoul-metro-type-system)
46. [Kompasiana — Kaidah Baru Penulisan Waktu Menurut EYD V](https://www.kompasiana.com/tata.tambi/657ac74f12d50f268b624162/kaidah-baru-penulisan-waktu-menurut-eyd-v)
47. [Tirto — Cara Penulisan Angka dan Bilangan yang Benar Sesuai Ejaan PUEBI](https://tirto.id/cara-penulisan-angka-dan-bilangan-yang-benar-sesuai-ejaan-puebi-gbri)

---

## 10. Dua puluh tanda "slop" dan penggantinya

Tanda "slop" di sini berarti kebiasaan yang membuat antarmuka terasa generik
atau-buatan. Setiap baris menyebut apa yang terjadi di Daily Route dan apa
yang harus dilakukan.

| # | Tanda | Kenapa terasa generik | Pengganti di Daily Route |
| --- | --- | --- | --- |
| 1 | **Daftar kartu identik dengan radius sama** | Semua hal bersaing di volume yang sama | Hanya satu kartu per panel; bagian lain memakai garis pemisah 1 px dan jarak |
| 2 | **Kartu di dalam kartu** | Kedalaman visual yang tidak informatif | Batas tiga tingkat: panel, kartu, baris. Kartu tidak pernah bersarang |
| 3 | **Border hairline dan bayangan lebar pada objek yang sama** | Tepi dan bayangan sama-sama menentukan bentuk | Kartu: border saja. Bayangan hanya untuk yang melayang |
| 4 | **Grid kartu identik untuk daftar perjalanan** | Setiap kaki terasa sama pentingnya | Daftar baris: ikon di kiri, teks di tengah, durasi di kanan |
| 5 | **Durasi perjalanan yang tidak menonjol** | Penumpang tidak tahu berapa lama perjalanannya | Durasi 40 px, satu-satunya angka besar |
| 6 | **Hierarki tipografi datar** | Heading dan body hampir sama besar | Sembilan langkah skala; 40/28/20/16/15/13/12 |
| 7 | **Label uppercase di atas nama tempat** | Nama diri dihapus oleh huruf besar | Eyebrow hanya berisi kata kiasan; nama tempat sentence case |
| 8 | **Copy pemasaran** ("solusi cerdas", "revolusi", "terbaik") | Janji besar tanpa isi | Copy hanya menyatakan fakta: "1 jam 9 mnt", "2 kali pindah", "Rp5.000" |
| 9 | **Tanda seru di setiap CTA** | Teriak-teriak | Tidak ada tanda seru di mana pun |
| 10 | **Em-dash sebagai tanda baca** | Kebiasaan menulis generik | Koma atau titik; Indonesia tidak memakai em-dash |
| 11 | **Emoji sebagai ikon** | Murah dan tidak konsisten | `lucide-react`, satu ikon per makna, selalu dengan tooltip |
| 12 | **Ikon besar dalam ubin rounded di atas judul** | Pola kartu fitur generik | Ikon mode 16 px dalam lingkaran 32 px di kiri baris |
| 13 | **Angka besar dengan gradient text** | Dekorasi, bukan data | Durasi 40 px warna tinta solid, `tabular-nums` |
| 14 | **Gradien ungu ke biru** | Warna produk SaaS 2023 | Tidak ada gradien; satu warna aksen jade, warna mode sebagai data |
| 15 | **Radius besar di semua sudut** | Setiap kartu terlihat sama | Maksimal tiga radius terlihat; radius mengikuti ukuran permukaan |
| 16 | **Spasi monoton** | Semua jarak sama, tidak ada kelompok | 12 px di dalam kelompok, 24 px antar kelompok |
| 17 | **Label alternatif yang menyalin isi** ("9D . 4C") | Tidak menjawab "kenapa ini" | Label menurut tujuan optimasi, isi tetap di baris kaki |
| 18 | **Kosong tanpa jalan keluar** | Penumpang buntu | Empat state kosong, masing-masing satu jalan keluar yang bisa diklik |
| 19 | **Memuat yang menghapus hasil** | Informasi hilang tanpa alasan | Rute lama tetap + garis progres 2 px |
| 20 | **Istilah yang tidak berasal dari operator** ("halte" untuk stasiun) | Produk terasa diterjemahkan | Istilah diambil dari UU 22/2009 dan dari nama resmi operator |

---

## 11. Yang tidak bisa diverifikasi

Bagian ini jujur: hal-hal berikut **tidak** bisa dipastikan dari sumber yang
dibuka, dan tidak boleh dipakai sebagai dasar angka.

| Hal | Kenapa tidak bisa diverifikasi | Yang dipakai sebagai gantinya |
| --- | --- | --- |
| **Pedoman istilah KAATU / Komdigi** | Tidak ada pedoman publik "KAATU" atau EGAUM yang bisa ditemukan; tidak ada dokumen ber-SBN tentang istilah layanan penumpang | UU 22/2009, PP 79/2013, PP 30/2021, PM 15/2019, KBBI, dan PUEBI |
| **`kci.id` (KAI Commuter)** | Situs tidak merespons saat diambil | Wikipedia ("Stasiun"), dan pola operator rel lain |
| **Tampilan OMNY, DB Navigator, SNCF Connect, BART, MTA, ÖBB ScottyMobile** | Hanya halaman toko tanpa akses ke tampilan; tidak ada dokumentasi UI publik yang ditemukan | Tidak dinilai; tabel 2.1 menandainya "tidak diverifikasi" |
| **Mobbin** | Paywall; kumpulan layar tidak bisa dibaca | Tidak dipakai |
| **Baymard** | Risetnya e-commerce (keranjang, checkout); tidak relevan untuk rute transit | Tidak dipakai |
| **Kontras chip kode jalur di atas tint 12 %** | Angka kontras di `ux-visual-language` §2.2 diukur terhadap `--surface`, bukan terhadap latar tint; mengukur ulang butuh nilai warna tint yang bergantung pada mode | Bentuk baru: teks `text-ink` di atas tint, warna moda pada border 2 px |
| **Panjang baris tepat pada 380 px** | Dihitung dari lebar kolom dan ukuran huruf, bukan diukur di peramban | 48 sampai 52 karakter, nilai turunan yang dinyatakan sebagai perkiraan |
| **Skala tipografi "produktif" versus "ekspresif"** | Carbon memakai dua set; produk ini memakai satu set | Satu set, dengan alasan tertulis di §4.1 |

---

## 12. Cara memakai laporan ini

1. **Untuk mengubah antarmuka:** pakai bagian 7 (audit) sebagai daftar kerja
   dan bagian 8 sebagai angka. Section 4 dan 5 menjelaskan kenapa.
2. **Untuk memastikan tidak ada regresi:** jalankan
   `python3 research/tools/ux-visual/typography_check.py`. Skrip itu hanya
   membaca; ia tidak pernah mengubah berkas sumber.
3. **Untuk menambah angka baru:** ubah `research/ux-transit-craft.spec.json`
   lebih dulu, lalu jalankan skripnya. Kalau angka tidak ada di spec, skrip
   akan melaporkannya sebagai pelanggaran.
4. **Untuk menambahkan aturan copy:** tambahkan satu entri ke `copy.rules` di
   spec, dengan `before` yang bisa dicari dan `after` yang sudah baku.

### 12.1 Baseline pemeriksa

Hasil `python3 research/tools/ux-visual/typography_check.py` pada 21 Oktober
2026, atas 27 berkas di `apps/web/src`:

| Kategori | Galat | Peringatan |
| --- | --- | --- |
| Heks warna di dalam komponen | 9 | 0 |
| Ukuran huruf di bawah lantai 12 px | 11 | 0 |
| Istilah copy yang harus berubah | 14 | 0 |
| Ukuran huruf di dekat skala (14 px) | 0 | 3 |
| Spasi setengah langkah atau di luar skala | 0 | 25 |
| Line-height di luar daftar | 0 | 9 |
| Radius di luar skala | 0 | 1 |
| Angka tanpa `tabular-nums` | 0 | 4 |
| **Total** | **39** | **42** |

Semua 39 galat adalah temuan nyata, bukan false positive; tidak satu pun
berasal dari sumber yang salah baca. Skrip keluar dengan kode 1 bila ada
galat, sehingga bisa dipakai sebagai gerbang di CI tanpa mengubah berkas
sumber apa pun.


