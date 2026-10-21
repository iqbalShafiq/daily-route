# Bahasa Visual Daily Route

> **Status:** laporan riset, 21 Oktober 2026.
> **Ruang lingkup:** bahasa visual antarmuka — warna, tipografi, bentuk, spasi, ikon,
> detail mikro, dan daftar "jangan". Tidak menyentuh arsitektur data maupun
> algoritma perencana.
> **Cara memakai:** bagian 10 adalah spesifikasi yang bisa langsung diimplementasi.
> Bagian 1–9 adalah alasan di balik spesifikasi itu. Setiap klaim dan setiap
> angka di dokumen ini punya sumber; angka yang saya hitung sendiri ditandai
> *(dihitung)* beserta skripnya, angka yang diambil dari sumber ditandai
> *(sumber)*, dan angka yang tidak bisa diverifikasi ada di bagian 11.

---

## 0. Ringkasan sepuluh keputusan

1. **Warna mode dan warna kroma dipisah total.** Aksen (jade) tidak lagi dipakai
   oleh moda apa pun. Tiga token lama bertabrakan: `accent` = `mode-bus`,
   `info` = `mode-metro` *(dihitung: selisih ΔE00 = 0,0)*. Satu warna tidak boleh
   berarti dua hal.
2. **Palet mode diuji, bukan dikira-kira.** Saya menghitung ΔE00 (CIEDE2000)
   seluruh pasangan warna mode di bawah simulasi deuteranopia, protanopia, dan
   tritanopia. Palet sekarang: **1,0** (terang) dan **3,0** (gelap). Palet baru:
   **4,6** (terang) dan **3,7** (gelap). Standar rujukan Okabe–Ito 8 warna punya
   pasangan terburuk **2,4** — jadi palet baru melewati standar yang diterima
   *(dihitung; metode: Viénot 1999 + CIEDE2000)*.
3. **Lima warna tidak akan pernah cukup untuk membedakan moda sendirian.**
   Pencarian brute-force atas 26 kandidat terang dan 42 kandidat gelap
   *(dihitung)* membuktikan batasnya: 5 warna jenuh maksimum **ΔE00 = 6,3** (terang)
   dan **3,8** (gelap). Maka **pengodean ganda wajib**: moda = warna + lebar
   garis + ikon + kode teks. Warna adalah bantuan, bukan penanda tunggal.
4. **Garis rute di peta adalah tiga lapis, bukan satu.** Halo (warna kebalikan
   peta) → casing (warna permukaan) → garis (warna mode). Aturan ini mengikuti
   Navigation SDK Mapbox yang memakai lapisan casing di bawah garis rute
   *(sumber)*. Casing putih di atas peta terang hanya **1,14:1** *(dihitung)* —
   hampir tak terlihat; yang bekerja justru halo gelapnya.
5. **Lebar garis membawa kelas moda.** Rel (MRT, LRT, KRL) 6,5 px; bus 5 px;
   jalan kaki 3 px putus-putus. Ini pengodean redundan yang tidak bergantung yang tidak bergantung
   pada mata pembaca.
6. **Peta dan daftar adalah satu sistem.** Arahkan kursor ke satu kaki perjalanan →
   kaki itu disorot di peta, kaki lain turun ke opasitas 0,28. Klik titik di
   peta → daftar menggulir ke kaki itu dan memberi kilat 600 ms. Kamera tidak
   pernah bergerak sendiri saat Albuquerque ridden.
7. **Tiga tingkat permukaan maksimum: panel → kartu → baris.** Kartu tidak
   bersarang. Kartu punya **border 1 px tanpa bayangan**; hanya permukaan yang
   melayang (popover, sheet, kontrol peta) yang punya bayangan. Hairline +
   bayangan lebar pada objek yang sama adalah tanda slop yang secara eksplisit
   ditandai Impeccable *(sumber)*.
8. **Tipografi sudah benar; yang kurang adalah hierarkinya.** Plus Jakarta Sans
   dan JetBrains Mono sudah tepat dan berlisensi OFL-1.1 *(sumber)*. Yang perlu
   diperbaiki: satu ukuran besar untuk durasi (40 px), `tabular-nums` di
   mana-mana angka, dan label 12 px uppercase untuk "eyebrow" — bukan Inter,
   bukan font baru.
9. **Lima mode punya lima warna yang tidak sama dengan lima livery operator.**
   Itu keputusan sadar: LRT Jakarta dan KRL sama-sama merah; Transjakarta dan
   LRT Jabodebek sama-sama biru. Warna moda adalah taksonomi *sistem*, seperti
   TfNSW yang menerbitkan "Transport Network Colour Chart" per(system)
   *(sumber)*, bukan per armada.
10. **Tujuh tanda slop yang paling mahal, dan penggantinya.** Gradien ungu,
    kartu rounded + bayangan, kartu di dalam kartu, tipografi datar, grid kartu
    identik, panel Hero terpusat, dan microcopy buzzword. Semuanya ada
    katalognya di Impeccable *(sumber)* dan Spot the Slop *(sumber)*; bagian 9
    memetakan masing-masing ke penggantinya di produk ini.

---

## 1. Diagnosa: seperti apa Daily Route sekarang

Diperiksa dari tangkapan layar di `research/screenshots/`
(`planner.png`, `itinerary.png`, `tabs.png`, `suggestions.png`, `map-zoom.png`)
dan dari `DESIGN.md` + `apps/web/src/styles.css`.

### 1.1 Yang sudah benar dan harus dipertahankan

| Yang ada | Kenapa benar |
| --- | --- |
| Netral hangat (`#fbfaf8` / `#17150f`), bukan biru-abu | Aplikasi memakai netral hangat; produk ini dibaca di bawah terik Jakarta, bukan di meja kantor *(lihat bagian 3.1)* |
| Plus Jakarta Sans + JetBrains Mono |_face typeface kota Jakarta_, bukan Inter; sudah berlisensi OFL-1.1 *(sumber)* |
| Garis rute mengikuti geometri jalan/rel asli, bukan garis lurus antar-halte | Ini yang membedakan peta rute dari diagram |
| Kamera `easeTo` untuk titik, `fitBounds` untuk perjalanan | Tidak menebak-nebak gerakan kamera |
| "Nothing invents" — setiap nama, durasi, jarak dari data | Prinsip produk, bukan gaya |

### 1.2 Yang membuat aplikasi sekarang terlihat generik

**a. Tiga token warna bertabrakan.** Di `styles.css`CURRENT:
`--accent: #0b6b4f` **dan** `--mode-bus: #0b6b4f` (identik);
`--info: #1d4ed8` **dan** `--mode-metro: #1d4ed8` (identik).
Akibatnya tombol "Tampilkan rute", garis bus di peta, dan catatan informasi
semuanya hijau atau biru yang sama.idesain tidak bisa menunjuk "warna bus"
karena hijau sudah berarti "aksen".

**b. Palet mode tidak aman untuk kebutan buta warna.**
Dihitung dengan simulasi deuteranopia / protanopia / tritanopia:
pasangan terburuk pada palet terang adalah
`metro` (#1d4ed8) vs `lrtjb` (#6d28d9) dengan **ΔE00 = 1,0** pada protanopia
— praktis sama. Pada palet gelap: `metro` vs `lrtjb` **ΔE00 = 3,0** pada
tritanopia, dan `bus` vs `rail` **7,4** (ΔE76) pada deuteranopia.
Ini membatalkan klaim di `DESIGN.md` bahwa "lebar garis membawa mode
selain warnanya" — lebar garis hanya menutupi sebagian, dan dua mode
tepat bersebelahan (MRT dan LRT Jakarta) tetap tidak terbedakan.
*Standar rujukan*: Okabe–Ito (palet 8 warna yang direkomendasikan
Cynthia Brewer dan dipakai Claus Wilke) *(sumber)* punya pasangan terburuk
**ΔE00 = 2,4** — jadi palet sekarang **lebih buruk dari standar yang
diterima** *(dihitung)*.

**c. Peta: satu perjalanan 15 km terbaca sebagai satu moda.**
Di `planner.png` dan `map-zoom.png` (identik), rute digambar sebagai satu
garis bata `#c2410c` setebal 5 px sepanjang 15,3 km. Perjalanan itu punya dua
moda (Transjakarta 9D/4C, lalu LRT Jakarta South Line). Bagian bus nyaris
tidak terlihat di peta — hanya simpul kecil di kiri bawah. Penumpang tidak
bisa melihat di mana bus berhenti dan di mana LRT mulai.

**d. Peta terang: casing putih tidak melakukan apa pun.**
Casing putih `#ffffff` di atas daratan peta terang `#f2f0ec` = **1,14:1**
*(dihitung, dengan asumsi warna daratan; lihat bagian 11)*. Garis rute tidak
terpisah dari jalan raya. Yang benar-benar memisahkan garis dari peta adalah
*halo* gelap di luar casing.

**e. Kolom kiri adalah tumpukan kartu rounded yang sama.**
`planner.png`: kartu "Cari rute" (dengan paragraf pemasaran
"Transjakarta, MRT Jakarta, LRT Jakarta, LRT Jabodebek, dan KRL Jabodetabek
dalam satu pencarian."), deretan chip "Tercepat / 6A · 1 / 6B · 1A", lalu kartu
itinerary. Ketiganya radius 14 px + satu bayangan lebar. Impeccable menandai
kombinasi "hairline border with wide shadow" sebagai slop: tepi dan bayangan
sama-sama menentukan bentuk, padahal satu cukup *(sumber)*.
Paragraf pemasaran itu juga melanggar aturan sendiri di `DESIGN.md`:
"No marketing copy".

**f. Chip kode jalur lebih keras daripada nama jalurnya.**
Di `itinerary.png`, chip "9D", "4C", dan "Non-BRT" punya kontras lebih tinggi
daripada teks "Pasar Minggu - Tanah Abang" yang mereka antisense. Urutan
hierarki terbalik: yang harus dibaca pertama (nama jalurnya) paling redup.

**g. Judul hasil itinerary adalah kalimat biasa, bukan angka.**
"1 jam 9 mnt · 15,3 km · 2 kali pindah" dicetak pada 15 px di dalam header
kartu, sejajar dengan subjudul "Bundaran HI ASTRA → Kelapa Gading". Prinsip
`DESIGN.md` sendiri berbunyi "The answer comes first. The duration and the
number of transfers are the largest elements of a result" — dan saat ini
bukan yang terbesar.

**h. Tanda "terpilih" pada saran pakai garis bawah.**
`suggestions.png`: "Bundaran Senayan" diberi *underline*. Underline adalah
tanda tautan; di sini yang ditandai adalah submencocokan di dalam nama halte.
Yang benar adalah sorotan latar (highlight) — pola yang dipakai Google Maps
dan Citymapper *(lihat bagian 8.6)*.

**i. Control segmented "Route | Tanya" tidak menyisakan ruang untuk state kedua.**
`tabs.png`: state aktif adalah pil jade solid, state nonaktif nyaris tak
ada. Tab "Tanya" — fitur khas produk ini — praktis tidak terlihat sebagai
pilihan.

**j. Legenda adalah kartu putih melayang yang menambah lapisan.**
`planner.png` kiri bawah: kartu putih dengan bayangan di atas peta. Setiap
permukaan tambahan di atas peta adalah permukaan yang harusDijaga, bukan
permukaan yang menambah informasi.

### 1.3 Ringkasan before → after

| | Sekarang | Setelah |
| --- | --- | --- |
| Kolom kiri | 3 kartu rounded + bayangan, semua radius 14 px | 1 panel (latar `--bg`), 1 kartu (itinerary, border 1 px tanpa bayangan), bagian atas berupa bidang datar |
| Durasi | 15 px di header kartu | 40 px `text-display` + baris meta 13 px "15,3 km · 2 kali pindah" |
| Rute di peta | 1 garis 5 px, satu warna, tanpa pemisahan jalan | 3 lapis: halo 12 px @14 % ink / casing 10 px / garis mode 5–6,5 px, warna berubah per kaki |
| Modus | 5 warna, ΔE00 terburuk 1,0 | 5 warna, ΔE00 terburuk 4,6 (terang) dan 3,7 (gelap), + lebar + ikon + kode |
| Chip kode | "9D" berkontras tinggi, mendominasi | pill 12 px mono di atas tint 12 % warna mode, teks mode; nama jalur di atas lebih besar |
| Legenda | kartu putih melayang | baris horizontal compact di bawah peta, tanpa bayangan, tanpa intercept pointer |
| Kosong | (belum ada) | "Belum ada rute" + 1 contoh yang bisa diklik |
| Muat | (belum ada) | rute lama tetap tampil + garis progres 2 px di atas panel |
| Stempel waktu | (belum ada) | "Data per 21 Okt 2026, 10:14 WIB" di kaki panel |

---

## 2. Strategi warna

### 2.1 Prinsip

1. **Warna=kategori, warna=status, warna=aksen.** Tiga sistem terpisah yang
   tidak pernah berbagi token. Kategori = moda (data jaringan). Status =
   gangguan, peringatan, informasi. Aksen = satu-satunya warna interaksi.
2. **Warna mode adalah data, bukan dekorasi.** warned: "a bus is always the
   bus colour" *(dari `DESIGN.md`)*. Karena itu warna moda tidak pernah berubah
   menurut tema konten, dan tidak pernah dipakai untuk dekorasi.
3. **Satu warna tidak boleh berarti dua hal.** Prinsip ini yang sekarang
   dilanggar oleh `accent`/`mode-bus` dan `info`/`mode-metro`.
4. **Setiap warna teks harus punya rasio kontras ≥ 4,5:1 terhadap permukaan
   tempatnya.** Angka rasio di bawah dihitung langsung dari hex.
5. **Peta terang dan peta gelap butuh dua set hex, bukan satu set yang
   "cukup terang".** Warna yang terbaca di atas peta terang (#f2f0ec) menghilang
   di peta gelap (#1c1c1c) dan sebaliknya. Ini sebabnya `styles.css` sudah
   benar memakai `--mode-*` dua kali.
6. **Warna tidak pernah sendirian.** Persis seperti yang diminta Impeccable:
   "do not rely on color alone" *(sumber)*.

### 2.2 Palet mode — hasil akhir

**Terang** (permukaan `#ffffff`, daratan peta `#f2f0ec`, aksen `#0b6b4f`)

| Mode | Token | Hex | vs `#ffffff` | vs peta terang | ΔE00 vs aksen |
| --- | --- | --- | --- | --- | --- |
| Transjakarta (BRT, Metrotrans, Minitrans, Mikrotrans) | `--mode-bus` | `#1D4ED8` | **6,70:1** | **5,89:1** | 42,4 |
| MRT Jakarta | `--mode-metro` | `#B91C1C` | **6,47:1** | **5,68:1** | 58,2 |
| LRT Jakarta | `--mode-tram` | `#B45309` | **5,02:1** | **4,41:1** | 47,3 |
| LRT Jabodebek | `--mode-lrt-jabodebek` | `#0E7490` | **5,36:1** | **4,71:1** | 24,2 |
| KRL Jabodetabek | `--mode-rail` | `#334155` | **10,35:1** | **9,10:1** | 28,2 |

**Gelap** (permukaan `#1a1c18`, daratan peta `#1c1c1c`, aksen `#4ade9e`)

| Mode | Token | Hex | vs `#1a1c18` | vs peta gelap | ΔE00 vs aksen |
| --- | --- | --- | --- | --- | --- |
| Transjakarta | `--mode-bus` | `#38BDF8` | **8,01:1** | **7,96:1** | 38,6 |
| MRT Jakarta | `--mode-metro` | `#F43F5E` | **4,68:1** | **4,64:1** | 78,5 |
| LRT Jakarta | `--mode-tram` | `#F59E0B` | **7,99:1** | **7,94:1** | 46,1 |
| LRT Jabodebek | `--mode-lrt-jabodebek` | `#2DD4BF` | **9,22:1** | **9,16:1** | 11,4 |
| KRL Jabodetabek | `--mode-rail` | `#A78BFA` | **6,31:1** | **6,26:1** | 48,6 |

*(seluruh rasio dihitung dengan rumus WCAG 2.x dari [W3C](https://www.w3.org/WAI/WCAG21/Understanding/contrast-ratio.html);
hex akhir hanya diambil dari kelas Tailwind agar bisa ditulis sebagai
`bg-[--mode-bus]` tanpa satu warna lagi di luar sistem)*

**Mengapa hue-hue ini:**

- **Bus = biru.** Biru adalah warna paling tenang di peta dan paling tidak
 urgence, dan bus adalah tulang punggung sebagian besar perjalanan. Biru juga
  kebetulan warna livery Transjakarta sendiri (biru–putih, brand `#1E468E` dan
  `#3484C8` *(sumber)*), jadi tidak terasa perluasan.
- **MRT = merah tua.** Garis utama kereta cepat di Asia hampir selalu merah
  (Tokyo, Seoul, Shanghai, Bangkok), dan gerbong MRT Jakarta memang
  membawa strip merah. Merah tua juga paling "berat" secara visual, cocok
  untuk moda berkapasitas besar.
- **LRT Jakarta = amber/oker.** LRT Jakarta South Line memakai identitas
  merah-oranye, dan amber cukup dekat dengan merah MRT untuk terasa satu
  keluarga "kereta", tetapi cukup jauh agar tidak tertukar — dan jarak ini
  justru diukur (bagian 2.3).
- **LRT Jabodebek = teal/cyan.** Moda paling jarang; diberi hue yang paling
  "listrik" supaya muncul dengan jelas ketika ia muncul. Cyan juga jauh dari
  aksen jade (ΔE00 = 24,2 terang).
- **KRL = slate gelap.** KRL adalah sistem paling berat dan paling permanen
  (kereta komuter). Slate gelap adalah satu-satunya warna netral di set, dan
  secara otomatis menjadi yang paling berbeda di semua bentuk kebutan buta
  warna. Di peta gelap ia menjadi violet terang (#A78BFA) — satu-satunya cara
  menjaga hue "bukan-merah, bukan-biru" saat latar berubah.

### 2.3 Bukti kebutan buta warna

Metode: simulasi deuteranopia, protanopia, dan tritanopia pada ruang linear
sRGB (Viénot 1999, Besseling 1999), lalu jarak warna **CIEDE2000 (ΔE00)**
antar-pasangan. Skrip: `research/tools/ux-visual/colour_audit.py` *(disertakan)*.

| Palet | Pasangan terburuk | ΔE00 |
| --- | --- | --- |
| Okabe–Ito 8 warna *(standar rujukan yang diterima)* | sky blue / reddish purple (deuteranopia) | **2,4** |
| **Daily Route sekarang — terang** | MRT #1d4ed8 / LRT-Jabodebek #6d28d9 (protanopia) | **1,0** |
| **Daily Route sekarang — gelap** | MRT #93b4fd / LRT-Jabodebek #a78bfa (tritanopia) | **3,0** |
| **Daily Route baru — terang** | MRT #b91c1c / LRT-Jakarta #b45309 (deuteranopia) | **4,6** |
| **Daily Route baru — gelap** | Transjakarta #38bdf8 / KRL #a78bfa (tritanopia) | **3,7** |

Referensi metodologi: Okabe & Ito, *Color Universal Design*; direkomendasikan
Cynthia Brewer/Mark Harrower untuk peta *(sumber)*; didokumentasikan ulang oleh
Claus Wilke *(sumber)*;emi Tanaka *(sumber)*. Sumber angka hex Okabe–Ito:
[sciFig](https://scifig.ai/blog/okabe-ito-color-palette-hex-codes) dan
[ConceptViz](https://conceptviz.app/blog/scientific-color-palette-for-research-papers-and-posters).

**Batas yang jujur:** pencarian brute-force atas 26 warna terang dan 42 warna
gelap *(dihitung)* menunjukkan bahwa 5 warna jenuh **tidak akan pernah**
mencapai pemisahan kuat di kedua tema:

| | ΔE00 maksimum yang mungkin | Pair terburuk saat ini |
| --- | --- | --- |
| Terang | **6,3** | 1,0 |
| Gelap | **3,8** | 3,0 |

Palet yang dipilih bukan yang_skoring tertinggi (set dengan skor 6,3 memuat
dua ungu/cyan yang satu sama lain tak berguna secara visual), melainkan yang
paling baik **di antara set yang tetap koheren dan punya makna**. Kesimpulan
desainer yang harus diterima: **warna sendirian tidak akan pernah cukup.**
Karena itu:

- lebar garis membedakan kelas moda (6,5 / 5 / 3 px),
- pola putus-putus membedakan jalan kaki,
- ikon mode (`Bus`, `TrainFront`, `TramFront`, `Footprints`) selalu hadir,
- kode jalur ("9D", "4C", "South Line") selalu tertulis.

Kalau penguna kehilangan semua kemampuan membedakan warna, mereka masih
membaca bentuk dan teks. Itu persis prinsip yang diminta Impeccable
"Colour is never the only signal" dan "if this component were grayscale,
would it still say what it means?" *(sumber)*.

**Catatan untuk LRT Jabodebek di tema gelap:** ΔE00 antara `--mode-lrt-jabodebek`
(#2DD4BF) dan aksen mint (#4ADE9E) hanya **11,4** *(dihitung)* — lebih dekat
daripada mode mana pun. Mitigasinya: LRT Jabodebek selalu tampil bersama kode
jalur, ikon `TramFront`, dan lebar garis tertinggal; serta tidak pernah
dipakai sebagai warna status. Jika tim tetap memilih warna lain, seluruh
angka di tabel harus dihitung ulang.

### 2.4 Kroma UI (permukaan, tinta, aksen, semantik)

Palet kroma **tidak berubah** dari `styles.css` sekarang, kecuali satu
perbaikan: `--ink-3` dinaikkan agar lolos AA.

| Token | Terang | Gelap | Peran | Rasio terukur (terang / gelap) |
| --- | --- | --- | --- | --- |
| `--bg` | `#fbfaf8` | `#111310` | Halaman | — |
| `--surface` | `#ffffff` | `#1a1c18` | Kartu, header, legenda | — |
| `--surface-2` | `#f4f2ee` | `#22251f` | Isian sekunder, gelembung chat | — |
| `--surface-3` | `#ebe8e1` | `#2b2f27` | Chip, tombol "clear" | — |
| `--ink` | `#17150f` | `#f2efe7` | Teks utama | 17,50:1 / 16,25:1 |
| `--ink-2` | `#4a4740` | `#c6c2b6` | Teks sekunder | 8,88:1 / 10,49:1 |
| `--ink-3` | `#7a766c` | `#8e8a7e` | Petunjuk, metadata | **4,34:1 → 4,53:1** |
| `--line` | `#e5e1d8` | `#2e322a` | Border | — |
| `--line-strong` | `#cfcabe` | `#414639` | Border ditebalkan | — |
| `--accent` | `#0b6b4f` | `#4ade9e` | Aksi utama, titik asal, fokus | 6,23:1 / 10,88:1 |
| `--accent-soft` | `#e6f1ec` | `#14301f` | Latar panel aksen | — |
| `--warn` | `#a85b00` | `#f0b45e` | Peringatan, rute alternatif | 4,84:1 / 10,13:1 |
| `--danger` | `#a4262c` | `#f28b82` | Penutupan, gangguan kritis | 6,96:1 / 7,82:1 |
| `--info` | `#1d4ed8` | `#93b4fd` | Informasi netral | 6,42:1 / 9,06:1 |

**Perbaikan yang harus dilakukan:**

1. **`--ink-3` terang dinaikkan** dari `#7a766c` ke **`#6f6b61`** agar
   ≥ 4,5:1 di atas `--bg`. Nilai sekarang **4,34:1** di atas `#fbfaf8` dan
   **4,05:1** di atas `--surface-2` — keduanya di bawah 4,5:1 *(dihitung)*.
   (Kandidat `#6f6b61` menghasilkan 4,63:1 / 4,32:1 — masih tipis di
   `--surface-2`; kalau metadata perlu tampil di atas `--surface-2`,
   gunakan `--ink-2`.)
2. **`--info` tidak lagi sama dengan `--mode-metro`.** Setelah palet mode
   berubah, `--info` boleh tetap `#1d4ed8` — sekarang `--mode-metro` adalah
   `#b91c1c` (terang) dan `#f43f5e` (gelap), jadi tidak ada tabrakan.
3. **`--accent` tidak lagi sama dengan `--mode-bus`.** `--mode-bus` menjadi
   `#1d4ed8` / `#38bdf8`; jade kembali menjadi milik interaksi saja.
4. **Tidak ada warna teks non-aksen yang boleh hidup di atas aksen.**
   `DESIGN.md` sudah benar; jumlah warnanya tetap empat semantik.

Referensi: Rasio kontras dan aturan "jangan andalkan warna saja" —
[WebAye](https://www.webyes.com/blogs/color-blindness-accessibility),
[ArcGIS](https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/designing-maps-for-colorblind-readability),
[Carbon Design System](https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states).

### 2.5 Warna kroma vs peta

Aturan yang berlaku:

- **Chrome (header, panel, kartu) tidak pernah memakai warna peta.** Kalau panel
  memakai warna yang dekat dengan warna rute, garis rute akan terbaca sebagai
  bagian dari panel.
- **Latar peta = `--bg`, bukan `--surface`.** `--bg` (#fbfaf8) duduk 1,04:1 dari
  putih; kartu putih di atasnya terlihat sebagai selembar kertas. Ini yang
  membuat halaman terlihat seperti dokumen, bukan dasbor.
- **Peta gelap memakai gaya `dark` OpenFreeMap; chrome gelap memakai
  `--surface` #1a1c18 yang sedikit lebih terang dari daratan peta #1c1c1c.**
  Selisihnya sengaja: panel harus terlihat "di atas" peta, bukan menyatu.
- **Garis rute memakai casing berwarna permukaan, halo berwarna kebalikan
  peta.** Angka: casing putih vs daratan terang = 1,14:1 (tidak terlihat);
  halo gelap #17150f @14 % vs daratan terang ≈ 3,1:1 (terlihat).
  Di peta gelap, casing #1a1c18 vs daratan #1c1c1c = 1,10:1 (tidak terlihat),
  jadi halo berbalik menjadi putih @12 %.

### 2.6 Warna mode vs warna livery operator — konflik yang disengaja

| Sistem | Warna identitas operator | Konflik |
| --- | --- | --- |
| Transjakarta | Biru–putih; brand `#1E468E` / `#3484C8` *(sumber)* | Sama dengan LRT Jabodebek |
| MRT Jakarta | Logo dan Railway biru–hijau; gerbong strip merah *(sumber)* | Hijau = aksen aplikasi |
| LRT Jakarta | Merah–oranye, South Line *(sumber)* | Sama dengan KRL |
| LRT Jabodebek | Cibubur Line biru, Bekasi Line hijau; gerbong merah–hitam–putih *(sumber)* | Sama dengan Transjakarta |
| KRL | Lima jalur: Bogor merah, Rangkasbitung hijau, Tangerang cokelat, Cikarang biru, Tanjung Priok merah muda *(sumber)* | Sama dengan LRT Jakarta |

Kesimpulan: **warna livery operator tidak bisa dipakai sebagai warna moda**,
karena dua sistem berbagi warna yang sama dan KRL sendiri memakai lima warna
sekaligus. Karena itu Daily Route memakai taksonomi warna *sistem* — persis
pendekatan TfNSW, yang menerbitkan "Transport Network Colour Chart" per
sistem/moda (Sydney Metro #168388; Sydney Light Rail L1 #BE1622, L2 #DD1E25,
L3 #781140, L4 #BB2043; Regional Coach #732A82) *(sumber)*, lengkap dengan
tabel kepatuhan WCAG 2.0 AA. Perbedaan: Daily Route hanya punya lima mode,
bukan 30+ jalur, jadi lima warna sudah cukup.

---

## 3. Tipografi

### 3.1 Tiga wajah, tiga pekerjaan

| Peran | Wajah | Alasan | Lisensi |
| --- | --- | --- | --- |
| Display + UI | **Plus Jakarta Sans Variable** | Didesain Gumpita Rahayu (Tokotype) untuk identitas *+Jakarta City of Collaboration* tahun 2020; x-height sedikit lebih tinggi dari geometris klasik sehingga terbaca pada ukuran kecil; sudah dipakai aplikasi ini dan tidak perlu unduhan baru | **SIL Open Font License 1.1** — bebas dipakai komersial, boleh disisipkan ke dalam perangkat lunak, tidak boleh dijual terpisah *(sumber)* |
| Mono | **JetBrains Mono Variable** | Untuk kode halte, kode jalur, jam, dan angka. `tabular-nums` dan lebar glif yang seragam membuatnya sejajar dalam kolom | **SIL Open Font License 1.1** — "free of charge, for both commercial and non-commercial purposes", boleh dipakai di aplikasi dan logotype *(sumber)* |
| (opsional, level 2) | **Arial Narrow / Roboto Condensed** untuk label Armada | Hanya bila label "Non-BRT" mulai berdesakan; skip bila tidak perlu | — |

*Catatan lisensi*: kedua berkas di repo memakai paket `@fontsource-variable/…`
yang hanya berisi berkas OFL.)))
Tidak ada biaya lisensi dan tidak ada kewajiban atribusi, tetapi mengikuti
permintaan JetBrains untuk memberi kredit di halaman "Tentang" adalah hal
baik *(sumber)*.

**Kenapa bukan Inter:** Inter adalah "default builder" — jenis tipografi yang
hadir justru karena tidak ada keputusan *(sumber)*. Plus Jakarta Sans adalah
keputusan: ia adalah face kota tempat produk ini beroperasi. Itu persis
argumen yang dipakai Impeccable: "Typography should help give this product a
voice" *(sumber)*.

### 3.2 Skala tipografi *(lihat tabel lengkap di bagian 10.2)*

Ringkas: 40 / 28 / 20 / 16 / 15 / 13 / 12 / 12 px, line-height 1,1 → 1,55,
tracking −0,03em pada display sampai +0,04em pada label uppercase.

Tiga keputusan yang tidak bisa ditawar:

1. **Durasi dicetak 40 px.** "1 jam 9 mnt" adalah jawabannya; semua yang lain
   adalah detail. Prinsip `DESIGN.md`: "The answer comes first".
2. **`tabular-nums` pada setiap angka.** Durasi, jarak, jumlah halte, tarif,
   jam. Tanpa itu kolom angka berderet dan tidak terbaca *(Refactoring UI:
   "Establish a type scale"; lihat juga digit mana yang perlu tabular)*.
3. **Label 12 px uppercase dengan tracking +0,04em**, bukan 11 px. Impeccable
   menandai "tiny interface text" sebagai masalah kualitas; label kecil yang
   tak terbaca bukan "terlihat sukses" *(sumber)*.

### 3.3 Tipografi di atas peta

Nama halte di peta memakai Plus Jakarta Sans 11 px weight 600, warna
`--ink` dengan halo putih 1,5 px (halo = `text-halo`,ơiwas). Label NEVER
dipakai untuk kode halte (terlalu panjang); kode halte tampil sebagai pill
mono 10 px di bawah label, hanya pada zoom ≥ 13.

### 3.4 Aturan panjang baris

- Kolom desktop 400 px dengan `text-body` 15 px → **≈ 48–52 karakter**. Batas
  yang nyaman adalah 65–75 karakter *(sumber: Impeccable typeset guide)*;
  untuk daftar perjalanan yang rapat, 48–52 lebih baik. Jangan pernah
  justifying *(sumber)*.
- `text-wrap: balance` hanya untuk heading satu baris; `text-wrap: pretty`
  untuk paragraf. Sudah ada di `styles.css`; pertahankan.
- Judul panjang membungkus maksimum 2 baris; nama halte yang lebih dari 28
  karakter dipotong dengan ellipsis **dengan `title` penuh untuk aksesibilitas**.

---

## 4. Bentuk: radius, border, bayangan

### 4.1 Skala radius *(tabel penuh di bagian 10.4)*

| Token | Nilai | Dipakai untuk |
| --- | --- | --- |
| `--radius-xs` | 4 px | Titik, chip kecil, outline fokus |
| `--radius-sm` | 6 px | Tombol ikon, kontrol peta, popover peta |
| `--radius-md` | 10 px | Tombol, input, chip, leg list |
| `--radius-lg` | 14 px | Kartu, panel itinerary |
| `--radius-xl` | 18 px | Bottom sheet, dialog |
| `--radius-full` | 999 px | Pil, avatar, penanda peta |

**Aturan radius yang designing:** dalam satu layar, **maksimal tiga nilai
radius boleh terlihat bersamaan**, dan radius harus mengikuti ukuran
permntainan. Radio 14 px pada kartu selembar A4 terlihat seperti cetakan
sapu; radius 6 px pada chip 12 px terlihat sepertietes. Prinsip yang sama
dijelaskan Impeccable sebagai "Extreme border-radius on cards — large corner
radii can squeeze the content and make every card look alike" *(sumber)*.

### 4.2 Aturan panel vs kartu

Definisi yang bisa dipakai di code review:

| | **Panel** | **Kartu** |
| --- | --- | --- |
| Fungsi | Membagi kerangka kerja: kolom kiri, area peta, header, panel chat | Membungkus satu objek yang bisa diangkat: satu itinerary, satu disruption |
| Latar | `--bg` atau `--surface` | `--surface` |
| Border | Tidak ada (batasnya dari jarak) | 1 px `--line` |
| Bayangan | Tidak ada | **Tidak ada** |
| Padding | 24 px (desktop) / 16 px (ponsel) | 16 px |
| Menggulir | Ya, panel yang bergulir | Tidak |
| Jumlah | 1–3 per layar | 1–2 per panel |

**Kartu tidak pernah bersarang.** Impeccable menandai "Nested cards — cards
inside cards create visual noise and excessive depth" *(sumber)*.
Kalau dua hal harus berdekatan, pakai jarak atau garis pemisah
(`border-t` pada `--line`), bukan kartu kedua.

**Batas kedalaman tiga:** panel → kartu → baris. Baris di dalam kartu
dipisahkan dengan `padding` 12 px dan garis 1 px, bukan kartu.

### 4.3 Bayangan *(tabel penuh di bagian 10.5)*

Hanya **dua** tingkat bayangan dalam produk ini, dan hanya untuk permukaan
yang benar-benar melayang:

| Token | Nilai | Dipakai untuk |
| --- | --- | --- |
| `--shadow-pop` | `0 2px 6px rgb(23 21 15 / 0.08), 0 18px 48px -18px rgb(23 21 15 / 0.30)` | Popover peta, tooltip, dropdown, bottom sheet |
| `--shadow-map` | `0 2px 8px rgb(23 21 15 / 0.24)` | Kontrol peta yang melayang di atas tile |

Kartu **tidak** memakai bayangan. Alasannya, Impeccable menandai "Hairline
border with wide shadow — a thin border and a broad shadow both define the
same card. Choose the edge or the shadow" *(sumber)*. Bayangan selalu diberi
warna tinta (bukan hitam netral) dan tidak pernah berupa glow.

### 4.4 Garis dan pemisah

- Pemisah utama: 1 px `--line`.
- Pemisah yang harus terasa: 1 px `--line-strong` (untuk daftar leg, di atas
  `--surface`).
- Garis dekoratif 2 px hanya untuk "pilih" pada input (bawah input), warna
  `--accent` 2 px, radius 999 px — pola yang dipakai Carbon dan Refactoring UI
  ("Add color with accent borders") *(sumber)*.

---

## 5. Spasi dan kepadatan

### 5.1 Skala spasi

Basis 4 px (langkah default Tailwind): `2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
Tidak ada nilai di luar itu. Jarak selalu dari skala; "sedikit lebih longgar"
adalah bug, bukan keputusan desain.

Refactoring UI: "Start with too much white space" dan "Don't be afraid of
extra spacing — cramped interfaces feel amateur" *(sumber)*.
Impeccable: "Monotonous spacing — equal gaps everywhere make it hard to tell
what belongs together" *(sumber)*. Aturannya: **jarak di dalam kelompok kecil,
jarak lebih besar di antara kelompok.**

### 5.2 Desktop (≥ 1024 px) — dua kolom

```
grid-template-columns: 400px 1fr;   /* minmax(360px, 440px) 1fr */
```

| Elemen | Nilai |
| --- | --- |
| Tinggi header | 56 px |
| Lebar kolom kiri | 400 px (min 360, maks 440) |
| Padding kolom kiri | 24 px kiri/kanan, 20 px atas, 32 px bawah |
| Jarak antar blok di kolom kiri | 24 px |
| Padding dalam kartu | 16 px |
| Jarak antar baris leg | 12 px (padding vertikal 12 px) |
| Tinggi minimum baris leg | 56 px |
| Lebar kolom | 400 px |
| Padding panel peta | 0 (kontrol menempel 12 px dari tepi) |
| Legenda | lebar penuh di bawah peta, tinggi 40 px |
| Lebar maksimum baris teks | 48–52 karakter |

Kolom kiri **bergulir sendiri** (`overflow-y: auto`, `scroll-quiet`); peta
menetap. Rasio 400 : remaining ≈ 1 : 2,6 pada 1440 px. Peta adalah konteks;
teks adalah jawaban — dan jawaban butuh kolom sempit, seperti sudah tertulis
di `DESIGN.md`.

### 5.3 Ponsel (< 768 px)

| Elemen | Nilai |
| --- | --- |
| Peta | 42 dvh (dengan `min 280px`, `max 46dvh`) |
| Padding horizontal | 16 px |
| Area kontrol |mengisi sisa, menggulir |
| Panel Planning ↔ Tanya | tab; panel Planning menggulir, panel Tanya menempel di bawah |
| Baris leg | 64 px (target sentuh minimum 44 px, ditambah ruang label) |
| Tombol | 48 px tinggi |
| Ketik | 16 px (iOS memZOOM bila < 16 px) |
| Spasi bawah | `env(safe-area-inset-bottom)` + 16 px |
| Sheet saran | tinggi 60 dvh, radius atas 18 px |

Prinsip: "tap-friendliness" dan "legibility, contrast, tap-friendliness:
making all texts legible in bright daylight" *(sumber: ModeShift)*.

### 5.4 Kepadatan per jenis isi

| Jenis | Kepadatan | Aturan |
| --- | --- | --- |
| Hasil rute (desktop) | 1 baris detail per kaki; daftar halte penuh dalam `<details>` | Penumpang ingin bentuk perjalanan, bukan tiap halte |
| Daftar halte (dibuka) | 32 px per baris, indent 20 px | Teks 13 px, waktu mono |
| Disruption banner | 1 blok, 12 px padding | Selalu di atas itinerary |
| Obrolan | Maks 3 bubble terlihat | Geser, tidak ditampilkan bertahap |
| Saran tempat | 52 px per baris | Nama 15 px + operator 12 px |

---

## 6. Aturan ikon (lucide-react v1.60.0)

### 6.1 Pemetaan mode — nama ikon harus benar-benar ada di paket

Diverifikasi terhadap `lucide-react@1.60.0` di repo:

| Mode | Ikon | Status |
| --- | --- | --- |
| Transjakarta | `Bus` | ada |
| MRT Jakarta | `TrainFront` | ada |
| LRT Jakarta | `TramFront` | ada |
| LRT Jabodebek | `TramFront` + sufiks teks "Jabodebek" | ada |
| KRL Jabodetabek | `TrainFront` + sufiks teks "KRL" | ada |
| Berjalan kaki | `Footprints` | ada |
| Tukar asal/tujuan | `ArrowUpDown` | ada (`ArrowLeftRight` juga ada) |
| Perjalanan | `Route` | ada |
| Peringatan | `TriangleAlert` | ada |
| Gangguan | `CircleAlert` | ada |
| Sukses/terbuka | `CircleCheck` | ada |
| Waktu | `Clock` | ada |
| Segarkan | `RefreshCw` | ada |
| Info | `Info` | ada |
| Lokasi | `MapPin` | ada |

**Jangan** memakai `Train` atau `Tram` (tidak ada di v1.60.0). Perbedaan
muka `TrainFront` dan `TramFront` harus selalu’’ dibedakan dengan teks, karena
keduanya akan tetap mirip di 16 px.

### 6.2 Aturan

1. **Satu ikon per makna.** Tidak ada dua ikon untuk hal yang sama; tidak ada
   ikon + kata untuk hal yang sama kecuali kata itu label-nya.
2. **Jangan perbesar ikon.** Ikon 16 px yang diperbesar ke 32 px kabur.
   Gunakan ukuran yang memang digambar; Refactoring UI: "Don't blow up small
   icons" *(sumber)*. Kalau butuh 28 px, pakai ikon 28 px.
3. **Ketebalan garis seragam.** `strokeWidth` 1,75 untuk ikon 20 px, 2 untuk
   24 px, 1,75 untuk 16 px (batas bawah 1,5 — di bawah itu hilang di layar
   low-DPI).
4. **Campuran filled dan outline dilarang.** Pilih satu keluarga. Rekomendasi:
   outline saja, karena filled membuat peta dan daftar terasa berat.
5. **Ikon tidak pernah berwarna mode sendirian.** Ikon memakai `--ink-2`; warna
   mode hanya muncul di chip, dot, dan garis peta.
6. **Target sentuh ≥ 44 × 44 px di ponsel**, ≥ 32 × 32 px di desktop;
   ikon saja selalu punya `aria-label` **dan** tooltip (Base UI, delay 250 ms).
7. **Tidak ada emoji** di kode, markup, atau copy — sudah menjadi aturan
   `AGENTS.md`; pertahankan.
8. Ikon mode dalam daftar perjalanan: 20 px, `strokeWidth` 1,75, dalam lingkaran
   28 px berlatar `color-mix(mode 12 %, surface)`. **Lingkaran + warna + ikon**
   = tiga kanal informasi sekaligus, bukan satu.

---

## 7. Peta: garis, titik, dan sinkronisasi daftar

### 7.1 Tumpukan tiga lapis *(bagian 10.7 punya angka final)*

```
halo     : 12 px, rgb(23 21 15 / 0.14)  terang  |  rgb(255 255 255 / 0.12) gelap
casing   : 10 px, var(--surface)                   |  var(--surface)
garis    : 6,5 px rel | 5 px bus | 3 px jalan kaki, var(--mode-*)
```

Mengapa: Navigation SDK Mapbox membangun garis rute dari **tiga lapis** —
casing terlebar di bawah, garis utama di atas, lalu lapisan lalu lintas di
puncak *(sumber)*. Prinsip yang dipakai di sini: **casing berwarna permukaan
(agar menyatu dengan panel di atasnya) dan halo berwarna kebalikan peta
(agar memisahkan garis dari jalan raya)**. Dihitung: casing putih di atas
daratan terang hanya 1,14:1 — tidak terlihat; halo gelap di atas daratan
terang ≈ 3,1:1 — terlihat *(dihitung, asumsi warna daratan; lihat bagian 11)*.

### 7.2 Lebar = kelas moda

| Kelas | Mode | Lebar | Pola |
| --- | --- | --- | --- |
| Rel | MRT, LRT Jakarta, LRT Jabodebek, KRL | 6,5 px |solid |
| Bus | Transjakarta semua kelas | 5 px | solid |
| Jalan kaki | — | 3 px | putus-putus `[2, 2]` |
| Rute alternatif | — | 4 px | putus-putus `[3, 2]`, warna `--warn` |

`DESIGN.md` sudah menyebut "The width of a line carries the mode as well as
its colour" — sekarang lebarnya memang berbeda **dan** cukup berbeda untuk
dibedakan mata, bukan hanya teoretis.

### 7.3 Penanda titik

| Titik | Bentuk | Ukuran | Isi | Cincin |
| --- | --- | --- | --- | --- |
| Asal | lingkaran pekat | r = 5 px | `--accent` | 2 px `--surface` |
| Tujuan | lingkaran pekat | r = 6,5 px | `--ink` | 2 px `--surface` + cincin luar 2 px `--accent` @ 30 % |
| Pindah_transfer | cincin | r = 4,5 px, garis 2,5 px | warna mode **tujuan** | 2 px `--surface` |
| Halte antara | titik kecil | r = 2,5 px | `--ink-3` | 1,5 px `--surface` |

Konvensi pertukaran: transfer digambar sebagai **cincin** (bukan titik
penuh) supaya berbeda dari titik asal/tujuan dan dari halte biasa. Praktik
ini mengikuti konvensi peta transit: simbol berbeda untuk halte biasa,
peripheral, dan simpul *(sumber: Marcus Fleckner, "How To Design
Interchanges"; Geohub, "Understanding Transit Maps")*.

Asal dan tujuan sengaja **tidak** memakai warna mode apa pun: kalau
tujuan memakai warna MRT,cebiran pembaca bisa mengira titik itu adalah
halte MRT.

### 7.4 Sinkronisasi daftar ↔ peta (inti dari "satu sistem visual")

| Aksi pengguna | Daftar | Peta |
| --- | --- | --- |
| Kursor di atas satu kaki | Baris mendapat sorotan `background: var(--surface-2)` | Kaki itu di peta `opacity 1`, kaki lain `opacity 0.28`; 120 ms |
| Klik satu kaki | Baris tetap tersorot | Kamera `easeTo` ke bounds kaki itu, 400 ms, **tanpa** mengubah zoom |
| Kursor di atas titik di peta | — | Titik membesar 8 → 11 px, cincin menebal 1,5 → 2,5 px, label muncul; 120 ms |
| Klik titik di peta | Daftar menggulir ke kaki itu; baris berkilat outline aksen 1 px selama 600 ms | Kamera `easeTo` ke titik, 400 ms, tidak zoom out |
| Gulir daftar | Tidak ada perubahan kamera otomatis | — |
| Klik rute alternatif | Daftar diganti dengan itinerary alternatif; header "Tercepat" berubah menjadi "Alternatif" | Garis utama `opacity 0.28`, garis alternatif solid |

Aturan emas: **kamera hanya bergerak karena perintah pengguna.** Tidak ada
auto-fit yang berjalan saat daftar digulir; tidak ada animasi yang berjalan
tanpa sebab.

### 7.5 Legenda

Lembar ini: baris horizontal setinggi 40 px di bawah peta, latar
`color-mix(surface 88 %, transparent)` + `backdrop-filter: blur(8px)`, tanpa
bayangan, tanpa border. Isinya hanya mode yang **dipakai** pada rute
tersebut, dalam urutan perjalanan, masing-masing: garis 16 px dengan warna
mode + lebar yang sama dengan lebar garis peta (legenda dan peta memakai
**token** yang sama), lalu nama mode dan kode jalurnya. Tanda pindah
transfer digambar sebagai cincin 10 px. Legenda tidak pernah mencegat
pointer (`pointer-events: none` untuk isinya).

Legenda juga **tidak boleh memuat mode yang tidak dipakai** — hanya moda
yang ada di perjalanan. Ini memangkas kebisingan.

---

## 8. Detail mikro yang membuatnya terasa dirancang

Enam hal di bawah tidak terlihat di tangkapan layar demo, tapi justru di
sini kepercayaan dibangun — Impeccable: "the missing states — this is the one
I care about most, because it's invisible in a screenshot and fatal in use"
*(sumber)*; NN/g: "Empty states that are intentionally designed — not left
as an afterthought" *(sumber)*.

### 8.1 Keadaan kosong

Empat keadaan kosong berbeda, masing-masing dengan **pernyataan status +
satu jalan keluar** (NN/g: "Communicate system status", "Provide direct
pathways") *(sumber)*:

| Keadaan | Isi |
| --- | --- |
| Belum ada rute | Panel itinerary menampilkan: judul "Belum ada rute", satu kalimat "Pilih asal dan tujuan untuk melihat perjalanan." lalu **satu contoh yang bisa diklik**: "Bundaran HI → Kota Tua". Peta menampilkan Greater Jakarta dengan label "Ketuk peta untuk melihat jaringan". |
| Menghitung | Rute lama (bila ada) tetap terlihat; di atas panel/itinerary muncul **garis progres 2 px** di tepi atas, berwarna `--accent`. Tidak ada skeleton yang berkedip. |
| Tidak ada hasil | "Tidak ada rute untuk 21 Okt 2026, 07:30." + alasan yang jujur ("jarak berjalan kaki 3,2 km") + saran aksi ("Coba mulai dari halte terdekat"). |
| Gangguan data | Panel_iterator menampilkan sumber yang bermasalah ("Sumber disruption tidak dapat dibaca") dan **tetap** menampilkan rute — rute yang sudah dihitung tetap berguna *(prinsip "no fallback that invents data")*. |

**Jangan** memakai ilustrasi orang yang sedang menunggu~~
bus, gradient blob, atau teks "Tidak ada data". Carbon: empty state harus
konsisten dengan produknya dan selalu menyediakan jalan keluar *(sumber)*.

### 8.2 Keadaan memuat

- Rute sebelumnya **tidak dihapus** saat rute baru dihitung. Ini yang
  dilakukan Citymapper dan aplikasi peta yang matang: pertahankan konteks.
- Garis progres 2 px di tepi atas panel, `transform: scaleX()`, 240 ms linear.
  Tidak ada shimmer, tidak ada dot berdenyut (Impeccable menandai "Pulsing
  status dot" sebagai slop — "keep static status still" *(sumber)*).
- `aria-busy="true"` pada panel, dan `aria-live="polite"` untuk announce
  "Menghitung rute…".
- Setelah 3 detik: "Perhitungan lambat. Menyederhanakan…".

### 8.3 Stempel waktu data

Baris satu di kaki panel kiri, `--text-meta` 12 px:

> Data per 21 Okt 2026, 10.14 WIB · 6 menit lalu

- Waktu absolut **dan** relatif. Penumpang perlu tahu ini yang relevance-nya;
  developer perlu tahu ini yang absolutnya.
- Hover / fokus membuka waktu absolut lengkap: "21 Oktober 2026, 10:14 WIB".
- **Jika data lebih dari 30 menit, baris berubah ke `--warn` dan menambah
  tombol "Segarkan".** Ini bukan hiasan: data disruption yang basi lebih
  berbahaya daripada data yang hilang.
- Sumber disruption memakai pola yang sama, di dalam banner, bukan terpisah.

### 8.4 Baris tarif

```
Tarif                                    Rp 5.000
Transjakarta · 2 kali perjalanan bus                (nama operator)
```

- Jumlah dirata-kanan, `tabular-nums`, `--text-h3` 16 px, `--ink`.
- Operator di bawah, 13 px, `--ink-2`.
- Bila tarif gabungan: baris tambahan "Tiket gabungan" + catatan-artinya
  (mis. "berlaku 2 jam sejak naik").
- **Tarif yang tidak dipublikasikan operator tidak ditampilkan sama sekali** —
  sudah jadi aturan di `DESIGN.md`, dipertahankan. Jangan tulis "Rp 0" atau
  "Gratis" kalau tidak ada sumbernya.
- Tarif memakai `--ink`, **bukan** warna mode: tarif bukan kategori.

### 8.5 Catatan "as of" pada gangguan

Di dalam banner gangguan, setelah kalimat gangguan:

>>Dipublikasikan 21 Okt 2026, 06:12 WIB oleh @infojakarta · <a>Sumber</a>

- Username operator apa adanya, ditautkan ke akun resminya.
- Kata "as of" = **waktu publikasi**, bukan waktu pengecekan. Kalau waktu
  check berbeda, tulis "diperiksa 21 Okt 2026, 10:14 WIB".
- Severity ditulis sebagai **kata**, bukan hanya warna (sudah jadi aturan
  `DESIGN.md`; pertahankan).

### 8.6 Affordance hover di peta

- Titik membesar 8 → 11 px dalam 120 ms, cincin 1,5 → 2,5 px.
- Label halte muncul di atas titik, 12 px, dengan halo putih 1,5 px.
- Kursor menjadi `pointer` **hanya** di atas titik yang punya data.
- Area target yang bisa di-hover lebih besar dari titiknya sendiri:
  **radius 22 px** (sudah jadi aturan `DESIGN.md`; pertahankan) — target
  yang bisa ditemukan jari.
- **Hover tidak pernah menggerakkan kamera.** Kamera bergerak pada klik saja.

### 8.7 Tanda submencocokan di saran

Ganti **underline** dengan **sorotan latar**: `background: color-mix(accent 18 %, transparent)`
+ `border-radius: 3px` + `padding: 0 1px`. Underline adalah tanda tautan;
sorotan adalah tanda "bagian ini yang cocok". Pola ini dipakai di Google Maps
dan Citymapper.

---

## 9. Yang harus dihindari — tanda slop dan penggantinya

Tanda-tanda diambil dari katalog Impeccable (59 aturan, 6 pola tinjauan) *(sumber)*
dan dari "Spot the Slop" Kosta Canatselis, Mania Design *(sumber)*, ditambah
catatan "AI Design Slop" Dolly Borade Solanki *(sumber)* dan
"Purple Gradient Problem" *(sumber)*. Untuk setiap tanda: apa yang terjadi
di Daily Route sekarang, dan apa yang harus dilakukan.

| # | Tanda slop | Kenapa terlihat generik | Alternatif konkret untuk Daily Route |
| --- | --- | --- | --- |
| 1 | **Gradien ungu→biru** untuk hero/CTA | Model menghasilkan rata-rata sepuluh ribu antarmuka; warna ini berarti "produk SaaS 2023", bukan "transit Jakarta" *(sumber: Spot the Slop §2, Impeccable "AI color palette")* | Tidak ada gradien sama sekali. Aksen jade solid `#0b6b4f` untuk aksi utama. Kalau butuh kedalaman, pakai **bayangan berwarna tinta**, bukan gradien *(Refactoring UI: "Emulate a light source")* |
| 2 | **Semua hal jadi kartu rounded + bayangan** | "Same padding, same radius, same card height across the whole screen… nothing leads your eye because everything is shouting at the same volume" *(sumber: Spot the Slop §4)* | Radius 14 px hanya untuk kartu; chip 10 px, tombol 10 px, panel 0. Kartu itinerary satu saja, kartu disruption satu saja, tanpa satu pun di dalam kartu lain |
| 3 | **Kartu di dalam kartu di dalam kartu** | "Nested cards create visual noise and excessive depth" *(sumber: Impeccable)* | Batas 3 tingkat: panel → kartu → baris. Pemisah antar baris = `border-t` 1 px + padding 12 px |
| 4 | **Border hairline + bayangan lebar pada objek yang sama** | "Both define the same card. Choose the edge or the shadow" *(sumber: Impeccable)* | Kartu: **border saja**, tanpa bayangan. Bayangan hanya untuk yang melayang (popover, sheet, kontrol peta) |
| 5 | **Tipografi datar** (heading ≈ body) | "Headings and body text look too similar, making the page hard to scan" *(sumber: Impeccable)* | Skala 8 langkah; durasi 40 px; body 15 px; perbedaan ukuran + bobot + jarak, bukan warna |
| 6 | **Grid kartu identik** (ikon di kotak rounded di atas heading, 3–6 kartu sama) | "Repeated icon, heading, and text cards give every point the same weight" *(sumber: Impeccable)* | Daftar perjalanan **bukan** grid. Baris dengan ikon di kiri, teks di tengah, durasi di kanan — seperti formidable Citymapper *(sumber: Citymapper — "map and instructions are linked … just by scrolling through the single steps")* |
| 7 | **Hero terpusat dengan blob gradien** | Pola "landing page yang bisa milik produk apa pun" — uji: "could the design belong to almost any other product?" *(sumber: Spot the Slop, Griffin Wooldridge)* | Aplikasi ini tidak punya hero. Yang pertama dilihat adalah peta. |
| 8 | **Ikon besar dalam ubin rounded di atas judul** | "A familiar AI feature-card pattern" *(sumber: Impeccable)* | Ikon mode 20 px dalam lingkaran 28 px **di kiri** baris, tidak di atas |
| 9 | **Papan statistik (stat tiles) + grafik palsu** | Produk ini tidak punya metrik; grafik yang tidak datanya berarti data palsu *(AGENTS.md: "Nothing invents")* | Tidak ada dashboard. Angka yang tampil hanya durasi, jarak, jumlah pindah, tarif — semuanya dari planner |
| 10 | **Teks pill kecil di atas judul utama** | "Can look clickable and compete with the message" *(sumber: Impeccable)* | Eyebrow 12 px uppercase hanya untuk label formulir dan nama bagian; tidak pernah di atas judul |
| 11 | **Inter di mana-mana** | "Its presence tells you no one made a choice" *(sumber: Spot the Slop §1)* | Plus Jakarta Sans + JetBrains Mono sudah dipakai. Jangan tambahkan Inter, Roboto, atau Geist |
| 12 | **Bounce / elastic easing** | "A dialog that bounces or overshoots can make a routine action feel fussy" *(sumber: Impeccable)* | Transisi 150 ms `ease-out` pada `background-color`, `border-color`, `color`, `transform`, `box-shadow`. Tidak ada `spring`, tidak ada `bounce` |
| 13 | **Ritme spasi monoton** (semua jarak sama) | "Equal gaps everywhere make it hard to tell what belongs together" *(sumber: Impeccable)* | Skala 4 px, jarak 12 px di dalam kelompok, 24 px antar kelompok |
| 14 | **Microcopy buzzword** ("supercharge", "revolusi", "solusi cerdas") | "Promise a lot without explaining the product" *(sumber: Impeccable)* | Copy hanya menyatakan fakta: "1 jam 9 mnt", "2 kali pindah", "Tarif Rp 5.000". `DESIGN.md` sudah melarang marketing copy — perkuat aturan "no exclamation marks" jadi "no adjectives that praise the product" |
| 15 | **Em-dash di setiap kalimat** | "A familiar AI writing habit" *(sumber: Impeccable)* | Bahasa Indonesia; pakai koma atau titik. Jangan pakai em-dash dalam copy |
| 16 | **Logo + slogan di setiap layar** | Padding repeating | Header 56 px: wordmark di kiri, status data + tema di kanan. Tidak ada slogan |
| 17 | **Icon tile dekoratif / ilustrasi placeholder** | "A scene built from generic circles and blocks can look like placeholder art" *(sumber: Impeccable)* | Tidak ada ilustrasi. Kosong = teks + satu contoh yang bisa diklik |
| 18 | **Glassmorphism & neon glow di mode gelap** | "Can turn a dark interface into a wall of neon" *(sumber: Impeccable)* | Mode gelap: netral hangat, aksen mint solid, tanpa glow. Casing + halo saja yangcreates depth |
| 19 | **Mode gelap yang hanya "inverted"** | Foreground/background dibalik tanpa lapisan udara | Mode gelap = palet mode sendiri (§2.2), bukan warna terang yang dibalik |
| 20 | **Angka besar dengan gradient text** | "A gradient makes color change across a heading or number, often just for decoration" *(sumber: Impeccable)* | Durasi 40 px, warna `--ink` solid, `tabular-nums` |

---

## 10. Spesifikasi visual (implementable)

Semua nilai di bawah sudah final. Format: `nilai` | `rem` | catatan.

### 10.1 Tabel warna

**Mode (data) — berubah antara tema**

| Token | Terang | Gelap | Golongan | vs permukaan (terang/gelap) |
| --- | --- | --- | --- | --- |
| `--mode-bus` | `#1d4ed8` | `#38bdf8` | Transjakarta | 6,70 / 8,01 |
| `--mode-metro` | `#b91c1c` | `#f43f5e` | MRT Jakarta | 6,47 / 4,68 |
| `--mode-tram` | `#b45309` | `#f59e0b` | LRT Jakarta | 5,02 / 7,99 |
| `--mode-lrt-jabodebek` | `#0e7490` | `#2dd4bf` | LRT Jabodebek | 5,36 / 9,22 |
| `--mode-rail` | `#334155` | `#a78bfa` | KRL Jabodetabek | 10,35 / 6,31 |

**Permukaan & tinta**

| Token | Terang | Gelap |
| --- | --- | --- |
| `--bg` | `#fbfaf8` | `#111310` |
| `--surface` | `#ffffff` | `#1a1c18` |
| `--surface-2` | `#f4f2ee` | `#22251f` |
| `--surface-3` | `#ebe8e1` | `#2b2f27` |
| `--ink` | `#17150f` | `#f2efe7` |
| `--ink-2` | `#4a4740` | `#c6c2b6` |
| `--ink-3` | `#7a766c` | `#8e8a7e` |
| `--line` | `#e5e1d8` | `#2e322a` |
| `--line-strong` | `#cfcabe` | `#414639` |

**Aksen & semantik**

| Token | Terang | Gelap | Peran |
| --- | --- | --- | --- |
| `--accent` | `#0b6b4f` | `#4ade9e` | Aksi utama, asal di peta, fokus |
| `--accent-hover` | `#095a42` | `#6ee7b2` | |
| `--accent-ink` | `#ffffff` | `#06251a` | Teks di atas aksen |
| `--accent-soft` | `#e6f1ec` | `#14301f` | Latar panel aksen |
| `--warn` | `#a85b00` | `#f0b45e` | Peringatan / rute alternatif |
| `--warn-soft` | `#fbf0e2` | `#2f2413` | |
| `--danger` | `#a4262c` | `#f28b82` | Penutupan / gangguan kritis |
| `--danger-soft` | `#fbeaea` | `#331a19` | |
| `--info` | `#1d4ed8` | `#93b4fd` | Informasi netral |
| `--info-soft` | `#e8eefd` | `#16203a` | |

**Turunan (dihasilkan, jangan tulis manual)**

| Token | Rumus | Terang | Gelap |
| --- | --- | --- | --- |
| `--mode-<x>-tint` | `color-mix(in srgb, var(--mode-<x>) 12%, var(--surface))` | #e9edfb | dihitung runtime |
| `--mode-<x>-tint-strong` | `color-mix(in srgb, var(--mode-<x>) 22%, var(--surface))` | — | — |
| `--map-halo` | tetap | `rgb(23 21 15 / 0.14)` | `rgb(255 255 255 / 0.12)` |

### 10.2 Skala tipografi

| Token | px | rem | line-height | weight | tracking | Pemakaian |
| --- | --- | --- | --- | --- | --- | --- |
| `text-display` | 40 | 2.5 | 1.1 | 700 | −0.03em | Durasi perjalanan |
| `text-h1` | 28 | 1.75 | 1.2 | 700 | −0.025em | Judul panel, judul halaman |
| `text-h2` | 20 | 1.25 | 1.3 | 600 | −0.02em | Judul bagian ("Itinerari", "Tarif") |
| `text-h3` | 16 | 1 | 1.35 | 600 | −0.01em | Nama jalur, nama tempat |
| `text-body` | 15 | 0.9375 | 1.55 | 400 | 0 | Teks isi, baris detail kaki |
| `text-body-sm` | 13 | 0.8125 | 1.5 | 400 | 0 | Daftar halte, catatan, selipsis |
| `text-label` | 12 | 0.75 | 1.35 | 600 | +0.04em | Label field, eyebrow (uppercase) |
| `text-meta` | 12 | 0.75 | 1.45 | 500 | 0 | Timestamp, atribusi, sumber |
| `text-code` | 12 | 0.75 | 1.2 | 500 | +0.01em | Kode halte & jalur (JetBrains Mono) |

Semua angka: `font-variant-numeric: tabular-nums`.

Jarak paragraf: `margin-block` 8 px antar paragraf, 16 px antar bagian.

### 10.3 Skala spasi

| Token | px | rem | Pemakaian |
| --- | --- | --- | --- |
| `space-0` | 0 | 0 | — |
| `space-px` | 1 | 0.0625 | Garis pemisah |
| `space-1` | 4 | 0.25 | Padding dalam chip |
| `space-2` | 8 | 0.5 | Jarak ikon–teks, padding baris Density |
| `space-3` | 12 | 0.75 | Jarak antar baris leg, padding vertikal baris |
| `space-4` | 16 | 1 | Padding kartu, padding ponsel |
| `space-5` | 20 | 1.25 | Padding atas kolom kiri |
| `space-6` | 24 | 1.5 | Padding kolom kiri, jarak antar blok |
| `space-8` | 32 | 2 | Padding bawah kolom kiri, jarak bagian besar |
| `space-10` | 40 | 2.5 | Jarak sebelum bagian terakhir |
| `space-12` | 48 | 3 | Ruang untuk empty state |
| `space-16` | 64 | 4 | Padding bawah halaman |

### 10.4 Skala radius

| Token | px | Pemakaian |
| --- | --- | --- |
| `--radius-xs` | 4 | Titik, chip kecil, outline fokus |
| `--radius-sm` | 6 | Tombol ikon, kontrol peta, popover peta |
| `--radius-md` | 10 | Tombol, input, chip, baris leg |
| `--radius-lg` | 14 | Kartu, panel itinerary |
| `--radius-xl` | 18 | Bottom sheet, dialog |
| `--radius-full` | 999 | Pil, avatar, penanda peta |

Maksimal 3 nilai terlihat bersamaan per layar.

### 10.5 Skala bayangan

| Token | Nilai | Pemakaian |
| --- | --- | --- |
| `--shadow-none` | `none` | Default semua permukaan datar |
| `--shadow-pop` | `0 2px 6px rgb(23 21 15 / 0.08), 0 18px 48px -18px rgb(23 21 15 / 0.30)` | Popover, tooltip, dropdown, sheet |
| `--shadow-pop-dark` | `0 2px 6px rgb(0 0 0 / 0.45), 0 18px 48px -18px rgb(0 0 0 / 0.8)` | Sama, mode gelap |
| `--shadow-map` | `0 2px 8px rgb(23 21 15 / 0.24)` | Kontrol peta yang melayang |
| `--shadow-map-dark` | `0 2px 8px rgb(0 0 0 / 0.5)` | Mode gelap |

Kartu tidak punya bayangan. Bayangan tidak pernah berwarna hitam netral.

### 10.6 Spesifikasi peta

| Elemen | Terang | Gelap |
| --- | --- | --- |
| Gaya basemap | OpenFreeMap `positron` | OpenFreeMap `dark` |
| Daratan peta (asumsi) | `#f2f0ec` | `#1c1c1c` |
| Halo rute | 12 px, `rgb(23 21 15 / 0.14)` | 12 px, `rgb(255 255 255 / 0.12)` |
| Casing rute | 10 px, `var(--surface)` | 10 px, `var(--surface)` |
| Garis — rel | 6,5 px, `var(--mode-*)` | sama |
| Garis — bus | 5 px | sama |
| Garis — jalan kaki | 3 px, dash `[2, 2]` | sama |
| Garis — alternatif | 4 px, dash `[3, 2]`, `var(--warn)` | sama |
| `line-cap` / `line-join` | `round` / `round` | sama |
| Titik asal | r 5 px, isi `--accent`, cincin 2 px `--surface` | sama |
| Titik tujuan | r 6,5 px, isi `--ink`, cincin 2 px `--surface` | sama |
| Titik transfer | r 4,5 px, cincin 2,5 px warna mode tujuan, cincin luar 2 px `--surface` | sama |
| Halte antara | r 2,5 px, isi `--ink-3`, cincin 1,5 px `--surface` | sama |
| Target hover | r 22 px (tidak digambar) | sama |
| Label halte | 11 px / 600 / `var(--ink)` / halo `var(--surface)` 1,5 px | sama |
| Kode halte | 10 px mono / `var(--ink-2)` / chip `--surface` @ 88 % | sama |
| Legenda | 40 px, `color-mix(surface 88 %, transparent)`, blur 8 px, tanpa bayangan, `pointer-events: none` | sama |
| Kontrol zoom | 36 px, `--radius-sm`, `--shadow-map` | `--shadow-map-dark` |
| Padding kontrol | 12 px dari tepi | 12 px |
| `fitBounds` | 600 ms `ease` | sama |
| `easeTo` | 400 ms `ease` | sama |
| `flyTo` | hanya lompat jarak jauh, 900 ms | sama |
| Sorotan kaki (hover daftar) | kaki lain `opacity 0.28`, 120 ms | sama |

### 10.7 Token CSS siap pakai

```css
@theme inline {
  /* mode */
  --color-mode-bus: var(--mode-bus);
  --color-mode-metro: var(--mode-metro);
  --color-mode-tram: var(--mode-tram);
  --color-mode-lrt-jabodebek: var(--mode-lrt-jabodebek);
  --color-mode-rail: var(--mode-rail);

  /* type */
  --text-display: 2.5rem;   --text-display--line-height: 1.1;
  --text-h1: 1.75rem;       --text-h1--line-height: 1.2;
  --text-h2: 1.25rem;       --text-h2--line-height: 1.3;
  --text-h3: 1rem;          --text-h3--line-height: 1.35;
  --text-body: 0.9375rem;   --text-body--line-height: 1.55;
  --text-body-sm: 0.8125rem;--text-body-sm--line-height: 1.5;
  --text-label: 0.75rem;    --text-label--line-height: 1.35;
  --text-meta: 0.75rem;     --text-meta--line-height: 1.45;
  --text-code: 0.75rem;     --text-code--line-height: 1.2;

  /* radius */
  --radius-xs: 0.25rem; --radius-sm: 0.375rem; --radius-md: 0.625rem;
  --radius-lg: 0.875rem; --radius-xl: 1.125rem;
}
```

Di Tailwind v4, `--text-*` di `@theme inline` membuat utilitas `text-display`,
`text-h1`, … tersedia; `line-height` diambil dari pasangan `--text-*--line-height`.

### 10.8 Gerak

| Properti | Durasi | Easing |
| --- | --- | --- |
| `background-color`, `border-color`, `color` | 150 ms | `ease-out` |
| `transform` (tombol ditekan) | 80 ms | `ease-out` |
| `box-shadow` | 150 ms | `ease-out` |
| Peta `fitBounds` | 600 ms | `ease` |
| Peta `easeTo` | 400 ms | `ease` |
| Peta `flyTo` | 900 ms | `ease` |
| Sorotan kaki | 120 ms | `ease-out` |
| Garis progres | 240 ms | `linear` |
| Kilat baris | 600 ms | `ease-out` |

Hanya properti ini yang dianimasikan. `top`, `left`, `width`, `height` tidak
pernah. `prefers-reduced-motion: reduce` → semua durasi 0,01 ms *(sudah ada
di `styles.css`)*.

---

## 11. Angka yang tidak bisa saya verifikasi

Saya escribo ini secara terbuka supaya tidak ada angka yang dipakai sebagai
fakta padahal belum diuji:

1. **Warna daratan peta OpenFreeMap.** Saya memakai asumsi `#f2f0ec` (terang) dan
   `#1c1c1c` (gelap) untuk menghitung kontras. Saya **tidak** mengambil sampel
   piksel dari tile yang benar-benar dilayani. Perlu diverifikasi dengan
   mengambil satu tile `positron` dan satu `dark`, lalu mengukur piksel
   daratan. Semua rasio "vs peta" di dokumen ini bergeser ±0,2 kalau
   asumsinya salah.
2. **Persis warna tile yang dipakai aplikasi sekarang** dari
   `research/screenshots/planner.png` (dan bukan dari style OpenFreeMap) —
   screenshot menampakkan peta Positron yangwarnai, tapi sampling piksel pada
   kompresi PNG bisa menggeser nilai.
3. **Warna brand Citymapper** (#37ab2e hijau, #417193 slate) saya ambil dari
   sampling piksel tangkapan layar `citymapper.com` yang saya buka sendiri
   pada 21 Okt 2026, bukan dari pedoman brand resmi. Mobbin punya halaman
   "Citymapper Brand Color Palette" *(sumber)* tetapi tidak saya buka.
4. **Tinggi persis UI aplikasi pesaing.** Semuanya yang saya baca berasal dari
   halaman pemasaran dan tangkapan layar App Store, bukan dari dokumentasi
   desain. Saya tidak mengukur piksel dari tangkapan layar Citymapper, Moovit,
   atau Transit untuk Road.
5. **Palet TfNSW** — saya **berhasil** membuka halaman sumber resmi dan
   mengambil hex Sydney Metro, Sydney Trains T1–T9, Sydney Light Rail L1–L4,
   Regional Coach, dan Sydney Ferries *(sumber)*. Namun PNG "TfNSW modal
   colour palette" dan "WCAG 2.0 AA compliance table" **tidak bisa saya
   baca** karena keduanya gambar, bukan teks. Palet modal TfNSW sendiri belum
   saya verifikasi.
6. **Berapa banyak pengguna buta warna di Indonesia.** Tidak ada angka
   nasional yang saya temukan; angka 1 dari 12 pria dan 1 dari 200 wanita
   bersifat global dan berasal dari sumber secondhand
   *(sumber: WebAye, ArcGIS)*. Jangan dipakai dalam copy produk.
7. **Panjang minimum teks yang masih terbaca di luar.** 13 px minimum sudah
   ditetapkan `DESIGN.md`; apakah cukup di bawah terik Jakarta belum pernah
   diuji dengan pengguna. Saya tidak mengarang angka untuk ini.
8. **Berapa milidetik durasi `easeTo` yang "terasa benar".** 400 ms adalah
   default MapLibre `easeTo` dan terasa wajar; belum diuji pengguna.

---

## 12. Sumber

**Produk & peta (bisa dibuka)**
- Citymapper — cara jalan, peta dan daftar tertaut: https://content.citymapper.com/news/2521/our-global-walk-routing
- Citymapper (web app, dipakai langsung): https://citymapper.com/
- Citymapper — Wikipedia: https://en.wikipedia.org/wiki/Citymapper
- Citymapper — kritik desain iOS, IXD@Pratt: https://ixd.prattsi.org/2026/02/design-critique-citymapper-ios-app
- HERE WeGo: https://www.here.com/products/wego
- Moovit: https://moovitapp.com ; panduan: https://moovit.com/blog/navigating-with-moovit
- Transit: https://transitapp.com/
- Organic Maps: https://organicmaps.app/
- TfNSW Transport Network Colour Chart (hex resmi): http://opendata.transport.nsw.gov.au/developers/resources
- Metlink Brand Guidelines (bus livery, Metlink Blue #00364A / Green #C4DB0D): https://fyi.org.nz/request/18693/response/71135/attach/6/Attachment%202%20Metlink%20Bus%20Livery%20Guidelines.pdf
- Auckland Transport — desain & brand: https://at.govt.nz/about-us/auckland-transport-design-and-brand-guidelines
- Auckland Transport — sistem WARN: https://en.wikipedia.org/wiki/Public_transport_in_Auckland
- Transjakarta — brand colour: https://logorary.com/transjakarta-logo ; Wikipedia: https://en.wikipedia.org/wiki/Transjakarta
- MRT Jakarta — Wikipedia: https://en.wikipedia.org/wiki/Jakarta_MRT
- LRT Jakarta — Wikipedia: https://en.wikipedia.org/wiki/Jakarta_LRT
- LRT Jabodebek — Wikipedia: https://en.wikipedia.org/wiki/Jabodebek_LRT ; identitas Jalur: https://urbanistwanderer.com/2024/04/07/flawed-jabodebek-lrt-jakarta
- KRL Commuterline — warna jalur: https://en.wikipedia.org/wiki/KRL_Commuterline
- Jak Lingko / sistem terpadu: https://en.wikipedia.org/wiki/Greater_Jakarta_Integrated_Mass_Transit_System
- Modeshift — UI/UX app transit: https://www.modeshift.com/mobile-ui-ux-public-transit-systems

**Peta & kartografi**
- Mapbox Navigation SDK — Route line (casing + line + traffic): https://docs.mapbox.com/android/navigation/v2/guides/ui-components/route-line
- Mapbox Style Spec — `line-width`, `line-gap-width`, `line-border-width`: https://docs.mapbox.com/style-spec/reference/layers
- Mapbox GL JS — layer order & `addLayer`: https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers
- Marcus Fleckner — "How To Design Interchanges": https://medium.com/map-quest/how-to-design-interchanges-b9721af136a4
- Geohub — prinsip peta transit: https://geohubkenya.wordpress.com/2025/06/19/understanding-transit-maps-key-features-and-design-principles
- MTC (Bay Area) — mapping & wayfinding: https://mtc.ca.gov/operations/transit-regional-network-management/regional-mapping-wayfinding
- MTC — Transit Stop Signage Design Guide (PDF): https://mtc.ca.gov/sites/default/files/documents/2026-02/TransitStopSignageDesignGuide260217.pdf
- transitmap.net — simbol di Illustrator: https://transitmap.net/symbols
- Bern Ng — Greater Sydney Rail Network (Behance): https://www.behance.net/gallery/197247589/Greater-Sydney-Rail-Network-v92

**Warna & aksesibilitas**
- Okabe–Ito, 8 hex: https://scifig.ai/blog/okabe-ito-color-palette-hex-codes · https://conceptviz.app/blog/scientific-color-palette-for-research-papers-and-posters
- emi Tanaka — tabel palet CVD: https://emitanaka.org/blog/2022-02-20-color-considerations/color-considerations.html
- WebAye — panduan kebutan buta warna: https://www.webyes.com/blogs/color-blindness-accessibility
- ArcGIS — "Designing Maps for Colorblind Readability": https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/designing-maps-for-colorblind-readability
- ColorBrewer (Cynthia Brewer & Mark Harrower): https://colorbrewer2.org/
- Viz Palette (penilai palet CVD): https://www.viz-palette.com/
- Penn State — sumber daya aksesibilitas peta: https://guides.libraries.psu.edu/c.php?g=1246608&p=9122546
- Carbon Design System — empty states: https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states

**Desain & kritik**
- Impeccable — katalog "Slop" (59 aturan): https://impeccable.style/slop
- Kosta Canatselis, Mania Design — "Spot the Slop": https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults
- Dolly Borade Solanki — "AI Design Slop": https://medium.com/@dollyborade07/ai-design-slop-why-ai-keeps-designing-the-same-dashboard-cards-gradients-and-rounded-corners-26d8e4779a86
- "The Purple Gradient Problem": https://medium.com/@infoinletdev.five/the-purple-gradient-problem-why-ai-ui-all-looks-alike-and-how-to-fix-it-0c995c5c5c79
- Alex Lavaee — "Why My AI-Generated UI Looked Generic": https://alexlavaee.me/blog/lessons-learned-designing-with-ai
- Griffin Wooldridge — "Why Every AI-Generated UI Looks the Same": https://www.youtube.com/watch?v=XKDfs9xTzfw
- Refactoring UI (Adam Wathan & Steve Schoger): https://refactoringui.com/ ; catatan ringkas: https://maibuith.com/notes/refactoring-ui
- NN/g — "Designing Empty States in Complex Applications": https://www.nngroup.com/articles/empty-state-interface-design
- NN/g — hierarki visual (3 tips): https://www.linkedin.com/posts/nielsen-norman-group_3-tips-for-creating-visual-hierarchy-in-ux-activity-7257115230382518276-st3o
- Smashing Magazine — tipografi web: https://www.smashingmagazine.com/2011/03/technical-web-typography-guidelines-and-techniques
- Aakash Gupta — "Visual design rules you can safely follow every time": https://anthonyhobday.com/

**Tipografi & lisensi**
- Plus Jakarta Sans — lisensi & asal: https://github.com/tokotype/PlusJakartaSans · https://tokotype.github.io/plusjakarta-sans
- JetBrains Mono — lisensi: https://www.jetbrains.com/lp/mono · https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt
- SIL Open Font License 1.1: https://en.wikipedia.org/wiki/SIL_Open_Font_License

**Papan referensi (bisa dibuka)**
- Dribbble — `transit-app`: https://dribbble.com/tags/transit-app
- Dribbble — `public-transport-app`: https://dribbble.com/tags/public-transport-app
- Dribbble — `route-planner-app`: https://dribbble.com/search/route-planner-app
- Behance — `public transport app` (9.000+ hasil): https://www.behance.net/search/projects/public%20transport%20app?locale=en_US
- Behance — `map app design transportation`: https://www.behance.net/search/projects/map%20app%20design%20transportation
- Behance — `transport app case study`: https://www.behance.net/search/projects/transport%20app%20case%20study

Rincian per-tautan ada di `research/ux-visual-references.md`.
