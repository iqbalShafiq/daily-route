# Daily Route

Rute transportasi umum Greater Jakarta, dengan informasi pengalihan dan
penutupan yang diperbarui dari kanal resmi operator.

Daily Route mencakup **Transjakarta** (BRT, Metrotrans, Royaltrans,
Minitrans, Mikrotrans), **MRT Jakarta**, **LRT Jakarta**, **LRT Jabodebek**
dan **KRL Jabodetabek** — dalam satu graf jaringan, satu mesin perencana,
dan satu asisten yang menjawab dalam bahasa Indonesia.

---

## Apa yang dikerjakan aplikasi ini

1. **Cari rute** — masukkan asal dan tujuan dengan bebas ("Bundaran HI",
   "stasiun Grand Indonesia", "halte dekat Monas"), dapatkan itinerary per
   segmen, jumlah transfer, dan peta rutenya.
2. **Perhatikan gangguan** — pengalihan rute, penutupan halte, dan
   keterlambatan yang diumumkan operator diambil dari akun X resmi mereka
   dan dari berita, lalu dicocokkan dengan rute yang sedang dilihat.
3. **Tanya asisten** — asisten menjawab pertanyaan rute, memanggil alat
   yang sama dengan perencana, dan menyebutkan sumber setiap gangguan.

## Arsitektur

```
Browser (React 19 + TanStack + Tailwind v4 + MapLibre)
        │  /api/*
Express API ──────────┬── Drizzle ── Postgres 16 + pgvector
        │             │
        │             └── packages/transit      graf & A* perencana rute
        │
        └── Anvia agent ── OpenRouter (model)
                     ├─── X API v2   (pengumuman operator)
                     └─── Tavily     (berita Latest)
```

Tiga hal yang menentukan bentuk kode ini:

- **Graf adalah kebenaran.** Mesin perencana (A* di atas graf stasiun)
  menentukan rute dan durasinya. Model tidak pernah mengarang nama halte,
  koordinat, atau waktu tempuh.
- **Semantik di kedua sisi.** Pencarian tempat menggabungkan kesamaan
  vektor (pgvector), kesamaan trigram, dan kecocokan persis. Model
  classifies pengumuman, tetapi nama tempat yang ia sebut tetap
  "di-grounding" ke stasiun yang benar-benar ada.
- **Satu sumber data.** Pemetaan, بعيد, dan perubahan rute berasal dari
  snapshot yang sama, sehingga peta dan daftar langkah tidak pernah berbeda.

## Menjalankan

```bash
pnpm install
pnpm infra:up          # Postgres + pgvector di port 5433
pnpm db:migrate
pnpm db:seed           # memuat data/transit-network.json
pnpm data:embed       # menghitung embedding stasiun
pnpm dev               # API 3011, worker 4012, web 3010
```

Buka <http://localhost:3010>.

### Konfigurasi

Ada **satu** berkas `.env` di root repo, dimuat oleh `dotenv-cli`. Salin
`.env.example` menjadi `.env` lalu isi kuncinya. Kunci yang boleh kosong:

| Variabel | Boleh kosong | Fungsi |
| --- | --- | --- |
| `DATABASE_URL` | tidak | Koneksi Postgres |
| `AGENT_API_KEY` | ya | Model di OpenRouter; tanpa kunci, asisten dimatikan dan perencana tetap jalan |
| `AGENT_MODEL` | ya | Id model OpenRouter, mis. `google/gemini-2.5-flash-lite` |
| `EMBEDDINGS_BASE_URL` / `EMBEDDINGS_API_KEY` / `EMBEDDINGS_MODEL` | ya | Embedding untuk pencarian semantik; tanpa kunci, encoder lokal deterministik dipakai |
| `TAVILY_API_KEY` | ya | Pencarian berita operator |
| `X_BEARER_TOKEN` | ya | Pembacaan akun X resmi operator |

Semua kunci ada di server. Tidak ada satu pun yang sampai ke browser.

> **Catatan X (per 2026).** X kini memakai kredit per pemakaian, bukan tier
> Free/Basic/Pro. Pembacaan satu post ≈ $0,005 dengan deduplikasi 24 jam.
> Modal sampai-siap sekitar $6–12 per bulan untuk lima akun operator.
> Rinciannya ada di [`research/integrations.md`](research/integrations.md).

## Data: dari mana dan seberapa mutakhir

Tidak ada GTFS publik untuk operator-operator ini. Yang dipakai adalah:

| Sumber | Kontribusi | Lisensi |
| --- | --- | --- |
| OpenStreetMap (Overpass) | koordinat, urutan halte, relasi rute | ODbL |
| `research/data/transjakarta.json` | nama koridor resmi, operator, jam layanan, daftar halte | riset |
| `research/data/rail-jakarta.json` | nama dan kode stasiun MRT, LRT, KRL | riset |
| `research/transjakarta.md`, `research/rail-jakarta.md` | laporan lengkap dengan rujukan | riset |

Snapshot gabungan disimpan di `data/transit-network.json` dan ikut
di-commit, sehingga seed selalu reproducible. Perbarui dengan:

```bash
pnpm data:ingest          # jalankan ulang pipeline (raw OSM di-cache di data/raw)
pnpm db:seed && pnpm data:embed
```

Snapshot terakhir: **228 lintasan, 3.114 stasiun, 10.138 urutan halte, 50 simpul
transit** — mencakup 215 rute Transjakarta (BRT, Metrotrans, Royaltrans,
Minitrans, Mikrotrans) dan 13 lintasan rel (MRT, LRT Jakarta, LRT Jabodebek,
KRL).

## Skema database

`systems` → `lines` → `line_stops` → `stations`, dengan `station_groups`
yang menyatukan stasiun berbeda sistem pada satu simpul transit. Located
di `packages/db/src/schema.ts`; migrasi Drizzle ada di
`packages/db/drizzle/`.

`station_embeddings` memakai pgvector (768 dimensi) dan `pg_trgm` untuk
pencarian nama. Ekstensi dibuat di migrasi pertama.

## Menguji

```bash
pnpm typecheck   # tsc --noEmit, seluruh paket
pnpm lint        # eslint, seluruh paket
pnpm test        # unit + integrasi (terhadap database sungguhan)
pnpm test:e2e    # Playwright: desktop dan ponsel
```

Tes integrasi memakai database yang sesungguhnya, bukan tiruan:tuannya
adalah agar skema, kueri, resolver semantik, dan mesin perencana benar
satu sama lain.

## Struktur

```
apps/api      Express: data transit, perencana rute, chat agen (SSE)
apps/web      React 19, TanStack Router/Query, Tailwind v4, MapLibre
apps/worker   Monitor latar: polling X + Tavily, menulis gangguan
packages/...  config, env, db, transit, semantic, agent, ingest
data/         Snapshot jaringan yang dipakai seed
research/     Laporan riset dan ekstrak terstruktur
```

Panduan kerja untuk agen dan untuk manusia ada di
[`AGENTS.md`](AGENTS.md); sistem desainnya di [`DESIGN.md`](DESIGN.md).

## Lisensi data

Data jaringan diturunkan dari OpenStreetMap dan wajib diberi atribusi
(ODbL). Peta memakai tile OpenFreeMap, yang juga mensyaratkan atribusi;
MapLibre menampilkannya secara otomatis.
