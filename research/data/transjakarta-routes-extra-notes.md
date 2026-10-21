# Transkripsi peta rute resmi — 30 koridor Transjakarta

Sumber gambar: `https://smk.transjakarta.co.id/aset/berkas/rute/<KODE>-<TANGGAL>.<ext>`
(the operator publishes one "peta rute" image per corridor; the upload date is unknown
and had to be searched for).

Struktur data: `research/data/transjakarta-routes-extra.json` (transkripsi +
`reverseStops`). Transkripsi dibuat oleh `research/tools/build-routes-extra.py`; alat
bantu potong gambar: `research/tools/crop-route-map.py`,
`research/tools/slice-route-map.py`, `research/tools/route-map-dates.py`,
`research/tools/probe-route-map-dates.py`.

## Ringkasan

| | |
|---|---|
| Koridor diminta | 30 (29 kode + `1500102` yang bukan koridor) |
| Peta ditemukan | 27 |
| Peta tidak ditemukan | 2 (BW1, S14) |
| Koridor diabaikan | 1 (`1500102` — galat data di halaman operator) |
| Halte dibaca (arah utama) | 427 |
| Halte dibaca (arah balik) | 416 |
| Halte dengan `uncertain: true` | 0 |
| Versi peta (`Diperbarui per`) | 27 dari 27 terbaca |

## Tabel

| Kode | Nama pada peta | Berkas peta | Versi | Halte (utama / balik) |
|---|---|---|---|---|
| B14 | Summarecon Bekasi - Kuningan | `B14-20260720.jpeg` | 2026-06-26 | 18 / 12 |
| B25 | Bekasi - Dukuh Atas | `B25-20260819.jpeg` | 2026-08-17 | 27 / 27 |
| B51 | Cikarang - Cawang | `B51-20260608.jpeg` | 2026-06-02 | 6 / 7 |
| BW2 | Monas Explorer | `BW2-20250430.jpg` | 2024-12-18 | 10 / — (loop) |
| D31 | Cinere - Kuningan | `D31-20261012.jpeg` | 2026-06-26 | 22 / 14 |
| D32 | Cinere - Bundaran Senayan | `D32-20260618.jpg` | 2026-06-17 | 7 / 13 |
| D41 | Sawangan - Lebak Bulus via Tol Desari | `D41-20251208.jpg` | 2025-12-05 | 14 / 11 |
| P11 | Blok M - Bogor | `P11-20260714.jpeg` | 2026-07-13 | 14 / 13 |
| S31 | Bintaro Exchange - St. MRT Fatmawati | `S31-20260618.jpg` | 2026-06-17 | 3 / 2 |
| S61 | Alam Sutera - Blok M | `S61-20260714.jpeg` | 2026-07-13 | 20 / 16 |
| SH2 | Blok M - Bandara Soekarno-Hatta | `SH2-20260714.jpeg` | 2026-06-22 | 13 / 13 |
| T11 | Poris Plawad - Petamburan | `T11-20241107.jpg` | 2024-11-04 | 21 / 23 |
| T12 | Poris Plawad - Juanda | `T12-20241107.jpg` | 2024-11-04 | 18 / 22 |
| T31 | PIK 2 - Blok M | `T31-20260714.jpeg` | 2026-07-13 | 17 / 21 |
| 10B | Rusun Cipinang Besar Selatan - Halim | `10B-20260826.jpeg` | 2026-08-24 | 6 / 4 |
| 11B | Rusun Ujung Menteng - Penggilingan | `11B-20260221.jpeg` | 2026-02-15 | 16 / 17 |
| 11C | Rusun Pulo Gebang - Penggilingan | `11C-20260720.jpeg` | 2026-06-30 | 7 / 12 |
| 11M | Rusun Rawa Bebek - Bukit Duri | `11M-20260723.jpeg` | 2026-07-21 | 24 / 21 |
| 11P | Rusun Pondok Bambu - Wali kota Jakarta Timur | `11P-20240709.jpg` | 2024-07-04 | 26 / 24 |
| 11R | Rusun Cakung KM 2 - Penggilingan | `11R-20260723.jpeg` | 2026-07-21 | 23 / 26 |
| 12C | Rusun Waduk Pluit - Rusun Penjaringan | `12C-20260926.jpg` | 2026-07-21 | 9 / 9 |
| 12F | Rusun Marunda - Rusun Waduk Pluit | `12F-20240620.jpg` | 2024-06-15 | 36 / 42 |
| 2H | Rusun Jati Rawasari - Senen | `2H-20260720.jpeg` | 2026-06-16 | 16 / 9 |
| 3A | Rusun Pesakih - Kalideres | `3A-20251016.jpg` | 2025-10-16 | 8 / 7 |
| 3B | Rusun Flamboyan - Cengkareng | `3B-20260826.jpeg` | 2026-08-26 | 9 / 16 |
| 3C | Rusun Kapuk Muara - Rusun Tambora | `3C-20260926.jpg` | 2026-07-13 | 21 / 17 |
| 4E | Rusun Jatinegara Kaum - Pulo Gadung | `4E-20240709.jpg` | 2024-07-04 | 16 / 18 |

Semua URL berkas punya bentuk
`https://smk.transjakarta.co.id/aset/berkas/rute/<BERKAS>` dan disimpan utuh pada
field `officialMapUrl`.

## Koridor tanpa peta

Pencarian berkas untuk rentang 2024-01-01 s.d. 2026-10-21 (tiga ekstensi: `.jpeg`,
`.jpg`, `.png`, sekitar 1100 kandidat tanggal per kode) tidak menemukan berkas apa pun
untuk dua koridor berikut. **Daftar halte keduanya TIDAK dikarang** — keduanya dilewati.

| Kode | Nama di `transjakarta-routes.json` | Status |
|---|---|---|
| BW1 | SEJARAH JAKARTA | tidak ada berkas peta rute |
| S14 | SUMMARECON SERPONG - LEBAK BULUS | tidak ada berkas peta rute |

Keduanya adalah layanan *Wisata* dan *Royaltrans*. Peta *Royaltrans* yang ada
(B14, D31, D32, S31) memakai templat "Penaikan / Penurunan" yang berbeda, jadi tidak
ada pola yang bisa disalin tanpa mengarang.

## Galat data di halaman operator

`research/data/transjakarta-routes.json` memuat entri dengan kode `1500102` dan nama
`081804500102`. Kode itu bukan kode koridor Transjakarta (9 karakter, pola nomor halte),
dan tidak ada berkas peta `1500102-*.jpeg`. Entri ini **diabaikan**, seperti diminta.

## Kontradiksi antara nama di `transjakarta-routes.json` dan isi peta

Semua berikut dibaca langsung dari header atau badan peta resmi.

| Kode | Nama di `transjakarta-routes.json` | Yang tertulis di peta | Catatan |
|---|---|---|---|
| B25 | BEKASI - DUKUH ATAS | header "Bekasi - Dukuh Atas", tetapi halte terakhir yang tercetak adalah **"Galungung"** (terminal bersama koridor 4 dan 6) | Tidak ada halte bernama "Dukuh Atas" di peta; peta tampaknya memakai nama terminal lama. |
| 10B | RUSUN CIPINANG BESAR SELATAN - PENAS KALIMALANG | header "Rusun Cipinang Besar Selatan - **Halim**", halte terakhir "**Penas Kalimalang 2**" | Nama "Penas Kalimalang" di daftar resmi cocok dengan halte peta; header peta menyebut "Halim". |
| 2H | RUSUN JATI RAWASARI - SENEN | header "Rusun Jati Rawasari - Senen", halte terakhir "**RSPAD 1**" | "Senen" pada daftar resmi adalah nama wilayah; peta menamai ujungnya RSPAD 1. |
| S31 | BINTARO - FATMAWATI | header "**Bintaro Exchange - St. MRT Fatmawati**" | Nama peta lebih panjang dan menyebut MRT. |
| 11P | RUSUN PONDOK BAMBU-WALIKOTA JAKARTA TIMUR | header "Rusun Pondok Bambu - **Wali kota** Jakarta Timur", halte terakhir "**Walikota** Jakarta Timur 1" | beda kapitalisasi dan spasi. |
| 11R | RUSUN CAKUNG KM2 - PENGGILINGAN | header "Rusun Cakung **KM 2** - Penggilingan" | ada spasi pada "KM 2". |
| 12F | RUSUN MARUNDA - RUSUN WADUK PLUIT | header "Rusun Marunda - Rusun Waduk Pluit" | beda spasi pada tanda hubung saja. |
| 3C | RUSUN KAPUK MUARA-RUSUN TAMBORA | header "Rusun Kapuk Muara - Rusun Tambora" | beda spasi pada tanda hubung saja. |

## Halte yang tidak pasti

Tidak ada halte yang diberi `uncertain: true`; semua nama terbaca dengan yakin. Yang
perlu dicatat:

* **3C, sisi kanan, halte ke-9** — nama saat transkripsi pertama salah baca; diperiksa ulang dengan memperbesar 6x lalu membaca piksel ASCII satu per satu. Huruf yang terbaca adalah P-o-l-s-e-k, jadi nama yang benar adalah **"Sbr. Polsek Teluk Intan"** — sudah diverifikasi ulang dengan cetakan ASCII:

  ```
  0x53 0x62 0x72 0x2e 0x20 0x50 0x6f 0x6c 0x73 0x65 0x6b 0x20 0x54 0x65 0x6c 0x75 0x6b 0x20 0x49 0x6e 0x74 0x61 0x6e
  ```
* **12F, sisi kiri** — tiga nama sempat salah baca dan sudah diperiksa ulang dengan
  diperbesar 2x: `Kantor Camat Tj. Priok`, `Plasa Telkom Jakut`,
  `Kantor Wali kota Jakut 1`.
* **Tanggal versi** pada peta berukuran kecil (640x1600 px) hanya setinggi sekitar 5
  piksel, jadi tanggal diverifikasi ulang dengan memperbesar 6x-18x dan, untuk B14,
  dibandingkan piksel per piksel dengan tanggal "26 Juni 2026" milik D31. Semua
  tanggal kini yakin.

## Konvensi bacaan

* Peta resmi menggambar satu sumbu vertikal dengan **dua kolom**: kolom **kiri** untuk
  arah **naik** (panah merah di kiri saluran) dan kolom **kanan** untuk arah **turun**
  (panah di kanan saluran). Bagian yang hanya satu kolom dipakai bersama dua arah.
* `stations` = daftar **sesuai urutan cetak** (atas ke bawah) untuk arah utama: kolom
  kiri lebih dulu, lalu halte bersama, lalu terminal bawah. Ini sama dengan konvensi
  yang dipakai data terkurasi `research/data/transjakarta.json` (bandingkan koridor 1
  dan 2 di sana: urutan peta = urutan data).
* `reverseStops` = daftar arah sebaliknya, juga sesuai urutan cetak: kolom kanan lebih
  dulu, lalu halte bersama yang sama, lalu terminal yang sama.
* Terminal diberi `"terminal": true`. Lencana koridor (lingkaran berwarna) dicatat
  sebagai `transfers`. Ikon stasiun (Stasiun MRT / LRT / KCI / Terminal Bus) dicatat
  sebagai `transfers` dengan nama sistemnya.
* Nama ditulis **persis seperti tercetak** — termasuk "Sbr.", "Ps.", "Jln.", "Gg.",
  "St.", kapitalisasi campuran ("Patra kuningan 2" vs "Patra Kuningan 1"),
  "SimpangBuaran" (tanpa spasi) dan "Sbr.United Tractors Belakang" (tanpa spasi).
* Peta *Royaltrans* (D31, D32, S31) memakai lencana **Penaikan** (belah segi empat
  biru) dan **Penurunan** (lingkaran hijau) — ini **bukan** transfer antar koridor,
  jadi lencana itu tidak masuk ke `transfers`.
* Peta memakai tanda **segitiga atas / segitiga bawah** ("Hanya Berhenti Sesuai Arah")
  untuk halte yang hanya dilayani satu arah. Tanda itu tidak dipisah menjadi daftar
  tersendiri; halte tetap ada di kedua daftar.

## Yang tidak ada di peta

* **Nama operator.** Tidak ada peta yang menyebut operator atau mitra. Nilai `operator`
  memakai nama variasi resmi dari `transjakarta-routes.json`:
  `PT Transportasi Jakarta (Transjakarta)` untuk *Royaltrans* dan *Wisata*,
  `PT Transportasi Jakarta (Transjakarta) + contracted operators` untuk
  *Transjabodetabek*, dan `PT Transportasi Jakarta + contracted operators` untuk
  *Rumah Susun* (mengikuti `research/data/transjakarta.json`).
* **Kode halte.** Peta tidak mencetak kode halte; `code` selalu `null`.
* **Brand pada header.** Header peta hanya memuat nama koridor dan kode (contoh
  "Bekasi - Dukuh Atas" / "B25"). Tidak ada teks brand seperti "Mikrotrans" atau
  "Angkutan Malam Hari", jadi `corridorType` diambil dari nama bagian di halaman
  resmi (`transjakarta.co.id/rute`): `Royaltrans`, `Transjabodetabek`, `Wisata`,
  `Rumah Susun`.
