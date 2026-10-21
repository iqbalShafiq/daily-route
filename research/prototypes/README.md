# Prototipe tata letak Daily Route

Tiga prototipe statis untuk pola tata letak baru. Semuanya mandiri: satu
berkas HTML, tanpa build, tanpa dependensi, tanpa CDN, tanpa font eksternal.
Font memakai `system-ui`. Palet dan tipografi mengikuti `DESIGN.md`.

## Berkas

| Berkas | Konsep | Ringkas |
| --- | --- | --- |
| `layout-a-map-first.html` | A | Peta penuh; kartu pencarian melayang di kiri atas; panel hasil mengambang di kiri bawah; tidak ada app bar. |
| `layout-b-sheet.html` | B | Peta penuh; satu bottom sheet (peek 30 %, half 55 %, full 92 %) dengan handle; pencarian di dalam sheet; di desktop sheet menjadi panel samping 420 px. |
| `layout-c-search-first.html` | C | Layar pencarian terpisah; peta dan panel hasil ringkas baru muncul setelah rute ditemukan. |

Angka-angka ini berasal dari `research/ux-layout-patterns.spec.json`.
Alasannya ada di `research/ux-layout-patterns.md`.

## Cara membukanya

Buka berkasnya langsung di peramban:

```bash
open research/prototypes/layout-a-map-first.html      # macOS
xdg-open research/prototypes/layout-a-map-first.html  # Linux
start research\prototypes\layout-a-map-first.html     # Windows
```

atau seret berkasnya ke jendela peramban. Tidak ada yang perlu dijalankan.

Bila peramban Anda memblokir berkas `file://`, sajikan foldernya sebagai
situs statis:

```bash
cd research/prototypes
python3 -m http.server 8899
# lalu buka http://127.0.0.1:8899/layout-a-map-first.html
```

## Yang ada di dalam halaman

- **Bilah harness** di paling atas: tombol perangkat (`Desktop 1440×900`,
  `Mobile 390×844`, `Bersamaan`). Bilah ini hanya alat bantu peninjau dan
  bukan bagian dari aplikasi.
- Konsep B punya tombol tambahan untuk mengganti detent sheet
  (`Peek 30 %`, `Half 55 %`, `Full 92 %`).
- Setiap bingkai adalah ukuran sebenarnya: 1440×900 dan 390×844. Pada
  mode `Bersamaan` bingkai desktop diperkecil agar muat; pada mode
  satu perangkat bingkai ditampilkan 1:1.
- Tata letak di dalam bingkai memakai *container query*, jadi bingkai
  mobile benar-benar memakai aturan compact dan bingkai desktop memakai
  aturan expanded, meski keduanya berada di satu halaman.

## Isi contoh

Perjalanan contoh memakai data nyata dari `data/transit-network.json`:

- Bundaran HI → Kelapa Gading
- 1 jam 17 mnt, 14,6 km, 3 kali pindah, tarif Rp7.000, berangkat 10.14 WIB
- Jalan kaki 3 mnt → Transjakarta **6B** *Ragunan - Balai Kota VIA Semanggi*
  → Transjakarta **2A** *Pulo Gadung - Rawa Buaya* → Transjakarta **4D**
  *Pulo Gadung - Kuningan* → LRT Jabodebek **S** *South Line (Lin Selatan) -
  Kelapa Gading to Manggarai*

Peta digambar sebagai SVG sederhana: abu-abu dasar, jalan, garis rute
berwarna mode, titik perhentian, dan penanda asal/tujuan. Bukan tile peta
sungguhan.

## Memeriksa konsistensi dengan spesifikasi

```bash
python3 research/tools/ux-visual/layout_check.py
python3 research/tools/ux-visual/layout_check.py --json
python3 research/tools/ux-visual/layout_check.py --only prototypes
python3 research/tools/ux-visual/layout_check.py --only application
```

Skrip hanya membaca. Ia membandingkan prototipe dengan
`research/ux-layout-patterns.spec.json` dan menandai apa yang masih jauh
dari spesifikasi pada `apps/web/src/routes/index.tsx` dan
`apps/web/src/routes/__root.tsx`.
