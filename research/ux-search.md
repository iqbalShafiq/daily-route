# UX pencarian saat mengetik (typeahead) — Daily Route

Panduan ini khusus untuk kolom **asal / tujuan** di Daily Route: satu input
teks bebas yang harus menawar 3.114 halte transit Jakarta, diisi dari resolver
semantik di server (pgvector cosine + pg_trgm trigram + pencocokan persis,
ambang "cukup yakin" = 0.3).

**Cara membaca angka di dokumen ini.** Setiap angka disebut sumbernya.
Kalau angka itu **kebijakan tim** dan bukan hasil dari sumber yang saya baca,
ditandai tegas sebagai *kebijakan tim*. Saya tidak menemukan angka baku dari
satu pun sumber untuk beberapa hal (waktu debounce, jumlah minimum
karakter, jumlah maksimum hasil) — jadi angka itu saya tetapkan sendiri,
dengan alasannya.

> **Catatan metode.** `web_search` di lingkungan ini mengembalikan
> `HTTP 401` (API key tidak valid), jadi semua sumber diambil langsung lewat
> HTTP dan dibaca satu per satu. Beberapa halaman penting (Apple HIG,
> web.dev, React Aria, Primer, Baymard) hanya dirender lewat JavaScript dan
> isinya tidak bisa saya baca sebagai teks — **halaman-halaman itu tidak
> saya pakai sebagai sumber angka apa pun**. Catatannya ada di bagian
> "Referensi".

---

## Prinsip

1. **Saran hanya muncul setelah pengguna menulis sesuatu yang bermakna.**
   W3C APG menyatakan popup pada combobox "displayed only if a certain number
   of characters are typed"; Mapbox Search Box API memangkas `q` di 256
   karakter dan `limit` di 10 hasil — daftar pendek memang asumsi desain
   yang konsisten.

2. **Satu permintaan per jeda mengetik, bukan satu permintaan per huruf.**
   Elastic Search UI menyebut `searchAsYouType` "executes a new search query
   with every key stroke" lalu menyediakan `debounceLength` "to avoid
   creating an excessive number of requests"; Algolia InstantSearch
   `searchBox` punya `searchAsYouType` default `true` plus `queryHook`
   sebagai titik kustomisasi resmi.

3. **Fokus DOM tidak boleh pernah pindah dari input.** APG: "DOM focus
   remains on the textbox"; posisi kursor di dalam daftar diumumkan lewat
   `aria-activedescendant`.

4. **Setiap keadaan punya tampilan sendiri.** AGENTS.md mewajibkan "every
   asynchronous surface has a loading, an empty and an error state" — daftar
   saran adalah permukaan asynchronous, jadi ia punya keadaan idle, memuat,
   kosong, gagal, dan basi.

5. **Sorotan hasil adalah informasi, bukan hiasan.** Algolia: "Visually
   highlighting search results is a must-have component of a great search
   experience"; Elastic memberi mekanisme resmi lewat `highlight` dengan
   `pre_tag`/`post_tag`.

6. **Warna tidak pernah jadi satu-satunya pembawa makna.** WCAG 2.2 SC
   1.4.1 (Level A): "Color is not used as the only visual means of conveying
   information".

7. **Di layar kecil, daftar adalah lapisan, bukan dropdown kecil.** Keyboard
   virtual menutup separuh layar; dropdown yang menempel di bawah input akan
   tertutup keyboard. (Kebijakan tim, ditopang MDN: `interactive-widget`
   bawaan browser adalah `resizes-visual`, yaitu hanya viewport visual yang
   mengecil, layout viewport tetap.)

---

## Perilaku yang direkomendasikan

### 1. Debounce: **250 ms** — *kebijakan tim*

Tidak ada satu pun sumber yang memublikasikan angka baku untuk debounce
typeahead: Elastic hanya menyatakan `debounceLength` "controls the length to
debounce / wait" **tanpa menyebut default**, dan Algolia menyerahkan
debouncing ke `queryHook` (kode aplikasi). Jadi angka ini ditetapkan di
sini:

| Batas | Alasan |
| --- | --- |
| Bawah 200 ms | manfaat praktisnya hampir tidak ada, tapi jumlah permintaan naik tajam untuk query panjang seperti "stasiun grand indonesia" |
| **250 ms** | Sweet spot: input tetap terasa "langsung", satu permintaan per jeda |
| Di atas 400 ms | Daftar terasa tertinggal dari ketikan; pengguna mulai mengetik ulang |

Selain debounce, request yang lebih lama harus di-`abort` saat query
berubah, lewat `AbortSignal` yang sudah disediakan TanStack Query
("TanStack Query provides each query function with an AbortSignal instance…
this means that all queries are cancellable"). Tanpa ini, request lama bisa
sampai belakangan dan menimpa hasil baru.

### 2. Panjang minimum: **2 karakter** — *kebijakan tim* (APG hanya menyebut "a certain number of characters")

Dua huruf sudah cukup untuk membedakan halte di koridor Jakarta
("bu" → Bundaran HI ASTRA, Bundaran Senayan, Buaran), sedangkan satu huruf
di korpus 3.114 stasiun dengan trigram match hampir pasti bising. Di bawah
2 karakter tidak ada request sama sekali.

### 3. Jumlah hasil: **maksimal 6** — *kebijakan tim*, sudah jadi nilai default API sekarang

`GET /stations?q=…` sudah menerima `limit` dan kode sekarang memanggil
`limit: 6`. Angka 6 dipertahankan karena:

- 6 baris ≈ 250–300 px, muat tanpa scroll di sebagian besar layar;
- Mapbox Search Box API membatasi `limit` "up to 10" — 6 jauh di bawah plafon
  dan masih terbaca;
- 6 baris menampilkan "1 terbaik + 5 alternatif", cukup untuk membedakan
  halte yang namanya mirip tanpa membuat daftar menjadi memo.

### 4. Ambang keyakinan: **0.3 untuk "cocok kuat", 0.08 untuk batas tampil** — *dari resolver yang sudah ada*

Ambang 0.3 milik resolver dan dipakai untuk "cukup yakin untuk merencanakan
rute". Di daftar saran:

| Skor | Perlakuan di UI |
| --- | --- |
| ≥ 0.30 | **Kecocokan kuat** — nama dicetak semibold, subjudul memakai `ink-2`; item ini boleh langsung dipakai untuk merencanakan rute |
| 0.08 – 0.30 | Alternatif — nama seperti biasa, subjudul `ink-3` |
| < 0.08 | Tidak ditampilkan (membuang noise) |

Kalau **tidak ada** kandidat ≥ 0.08: keadaan "tidak ada saran", bukan daftar
kosong.

### 5. **Urutan hasil tidak boleh berubah** selama pengguna memindai daftar

Aturan keras: urutan hanya boleh dihitung ulang bila *string query* berubah.
Navigasi panah dan hover tidak boleh mengubah urutan. Liste Neu sieht
sonst "jumping list" — barris yang sedang dibaca user melompat tepat ketika
mata bergerak turun. Lihat bagian "Yang harus dihindari".

### 6. Peta keyboard

Semua tombol ini sudah ada di APG Combobox Pattern (dan contoh
`combobox-autocomplete-list`). DOM focus **tidak pernah** pindah dari input.

| Tombol | Aksi | Sumber |
| --- | --- | --- |
| `↓` | Jika daftar tertutup: buka daftar. Jika terbuka: pindah ke opsi berikutnya (wrap ke atas dari opsi terakhir). | APG: Down Arrow "moves focus into the popup" |
| `↑` | Pindah ke opsi sebelumnya; dari opsi pertama, kembali ke input. | APG: Up Arrow "places focus on the last focusable element in the popup" |
| `Alt` + `↓` | Buka daftar tanpa memindahkan fokus. | APG (opsional) |
| `Alt` + `↑` | Tutup daftar. | APG (opsional) |
| `Enter` | Pilih opsi yang aktif: isi field dengan nama, tutup daftar, fokus tetap di input, caret di akhir nilai. | APG: "accepts the focused option… placing the input cursor at the end of the value" |
| `Escape` | Jika daftar terbuka: tutup daftar, jangan ubah teks. Jika daftar sudah tertutup: kosongkan field. | APG + contoh APG |
| `Tab` | Tutup daftar dan pindah ke elemen berikutnya di halaman. Popup dan turunannya **tidak** ada di urutan Tab. | APG: "the popup, and the popup descendants are excluded from the page Tab sequence" |
| `Home` / `End` | Ke opsi pertama / terakhir (opsional; boleh mengembalikan fokus ke input). | APG (opsional) |
| Huruf/simbol | Mengetik di input; fokus DOM tetap di input, daftar difilter ulang. | APG |
| `PageUp` / `PageDown` | Lompat ±5 opsi (opsional). | *kebijakan tim* |

Semua opsi harus bisa dijangkau; keyboard tidak boleh pernah terkurung di
dalam daftar.

### 7. Keadaan (state) dan apa yang ditampilkan

| Keadaan | Kapan | Yang tampil |
| --- | --- | --- |
| **Idle** | Input kosong dan belum difokus | Tidak ada panel. Di bawah input: teks bantuan "Ketik nama halte, stasiun, atau landmark" (kode `ink-3`, 12–13 px). Tidak ada daftar populer — 3.114 halte tidak punya "populer" yang jujur. |
| **Terlalu pendek** | 1 karakter | Tidak ada request, tidak ada panel, tidak ada perubahan layout (tanpa kedipan). Tetap tampilkan teks bantuan. |
| **Memuat** | Request sedang berjalan | **Pertahankan daftar sebelumnya** (bukan kosongkan) + spinner kecil di trailing field. Lihat "Yang harus dihindari" #1. |
| **Hasil** | ≥ 1 kandidat | Daftar 1–6 baris, active descendant = baris pertama. |
| **Kosong** | Request selesai, 0 kandidat | Satu baris di dalam panel: "Tidak ada halte yang cocok dengan “Bundaran X”." + tombol "Cari peta" (membuka panel peta). |
| **Gagal** | Request error | "Gagal memuat saran. Coba lagi." + tombol "Coba lagi". Jangan diamkan. |
| **Basi (stale)** | Request lama masih berjalan saat query berubah | Daftar lama tetap terlihat, dengan indikator tipis di trailing field; tidak ada kedipan. |

### 8. Bentuk tiap hasil

Tiap baris punya **dua baris teks**:

```
┌────────────────────────────────────────────┐
│ 📍 Bundaran Senayan           [Interchange] │   ← 14 px, `ink`, semibold
│   Bus · 4 garis · 120 m dari Anda           │   ← 11–12 px, `ink-3`
└────────────────────────────────────────────┘
```

- **Baris 1** — nama halte; bagian yang cocok diberi sorotan (§9).
- **Baris 2** — subjudul: sistem/mode (`mode-bus`, `mode-metro`, …) sebagai
  chip kecil + konteks. Konteks yang berguna untuk membedakan halte yang
  namanya mirip:
  distrik/kecamatan, jumlah garis yang lewat, kode halte, atau jarak dari
  lokasi pengguna bila koordinat tersedia. **Pilih satu hal saja**, jangan
  empat — subjudul adalah scent, bukan tabel.
- **Tidak ada** ikon yang berbeda per mode di dalam daftar; warna chip mode
  sudah cukup, dan warna tidak boleh jadi satu-satunya pembawa makna
  (WCAG 1.4.1) — nama sistem ikut tertulis.

### 9. Sorotan hasil: **hanya bagian yang benar-benar cocok**

Bukti bahwa sorotan membantu: Algolia membuka seri "Inside the Algolia
Engine" dengan "Visually highlighting search results is a must-have
component of a great search experience… a search result that is considered
as weird by a user without highlighting can become smart just by explaining
the processing done to retrieve it". Elastic menyediakan `highlight` dengan
`pre_tag`/`post_tag` (default `<em>`) untuk membungkus token yang berubah.

Aturan implementasi:

- Server mengembalikan **offset** rentang yang cocok, bukan HTML. Contoh:
  `matchedRanges: [[0, 3], [9, 11]]` untuk "bundaran hi".
- Client membungkus rentang itu dengan `<mark>` (elemen HTML semantik untuk
  teks yang disorot karena alasan tertentu), bukan `<em>` — supaya screen
  reader tetap membacanya sebagai satu nama utuh, dan supaya tidak ada
  HTML yang di-inject ke DOM.
- **Jangan pernah menyorot yang tidak cocok.** Kalau skor datang dari
  cosine similarity saja (tanpa bukti token), tidak ada sorotan — aturan
  "tidak menebak" dari AGENTS.md berlaku di sini juga. Persoalan
  "highlight yang berbohong" adalah anti-pattern #9.
- `<bdi>` membungkus nama agar nama beraksen/asing tidak merusak arah teks.

### 10. Pengumuman ke screen reader

APG **tidak** mensyaratkan live region di contoh combobox-nya (saya verifikasi
di berkas contoh resminya: tidak ada satu pun `aria-live`). Namun MDN
menjelaskan `role="status"` adalah live region implisit dengan
`aria-live="polite"`, dan "`aria-live="polite"` is used… The screen reader
will speak changes whenever the user is idle."

Keputusan: satu elemen `role="status"` (visually hidden) per field, berisi
teks pendek yang berubah saat daftar hasil berubah:

- `8 saran tersedia`
- `Tidak ada saran untuk “Bundaran X”`
- `Saran dimuat`

Jangan pernah menaruh nama halte lengkap di live region — itu membuat
screen reader membacakan isi daftar dua kali.

### 11. Apa yang terjadi setelah memilih

Isi field dengan nama resmi halte (bukan ketikan mentah pengguna), tutup
daftar, **fokus tetap di input** (APG), caret di akhir. Efeknya ke resolver:
nama itu dikirim sebagai query, jadi hasil yang dipilih bisa
skor ulang lebih tinggi.

---

## Pola komponen

### Struktur DOM

```html
<div class="relative">                       <!-- wrapper, posisi untuk panel -->
  <label id="origin-label" for="origin">Asal</label>

  <input
    id="origin"
    name="origin"
    type="text"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded="false"                    <!-- true saat panel terlihat -->
    aria-controls="origin-listbox"           <!-- hanya saat panel terlihat -->
    aria-activedescendant="origin-opt-0"     <!-- hanya saat ada opsi aktif -->
    aria-describedby="origin-hint"
    autocomplete="off"
    spellcheck="false"
    enterkeyhint="search"
  />

  <p id="origin-hint" class="text-xs text-ink-3">
    Ketik nama halte, stasiun, atau landmark
  </p>

  <!-- Panel: di desktop absolut di dalam wrapper; di seluler sheet -->
  <ul id="origin-listbox" role="listbox" aria-label="Saran tempat">
    <li id="origin-opt-0" role="option" aria-selected="true">
      <span>…</span>
    </li>
    <li id="origin-opt-1" role="option" aria-selected="false">…</li>
  </ul>

  <div role="status" aria-live="polite" class="sr-only">8 saran tersedia</div>
</div>
```

Atribut yang wajib ada dan yang sering terlupa:

| Atribut | Letak | Nilai | Catatan |
| --- | --- | --- | --- |
| `role="combobox"` | input | — | `aria-haspopup="listbox"` sudah implisit pada role ini, tidak perlu ditulis |
| `aria-autocomplete` | input | `"list"` | Satu-satunya perilaku yang dipakai di sini: daftar tanpa inline completion |
| `aria-expanded` | input | `true` / `false` | Wajib berubah mengikuti visibilitas panel |
| `aria-controls` | input | id listbox | APG: "only needs to be set when the popup is visible" — boleh tetap menulisnya, tetap valid |
| `aria-activedescendant` | input | id opsi aktif | **Inilah yang tidak ada di kode sekarang.** Tanpa ini, screen reader tidak tahu opsi mana yang sedang dipilih |
| `role="listbox"` | `ul` | — | |
| `role="option"` | `li` | — | Teks konten = accessible name |
| `aria-selected="true"` | `li` | hanya pada opsi yang dirujuk `aria-activedescendant` | APG: "Occurs only when an option is referenced by aria-activedescendant" |
| `role="status"` | div hidden | — | Live region implisit `aria-live="polite"` |

Dua hal yang wajib dijaga:

- **Setiap `li` harus punya `id` yang unik dan boleh diprediksi**
  (`origin-opt-0`, `origin-opt-1`, …). `aria-activedescendant` yang
  menunjuk id yang tidak ada adalah bug aksesibilitas.
- **Opsi aktif harus di-scroll ke dalam pandangan** setiap kali berubah
  (`scrollIntoView({ block: "nearest" })`). APG menyorot hal ini:
  "Managing aria-activedescendant visibility is essential to accessibility
  for people who use a browser's zoom feature to increase the size of
  content."

### Sketsa kode (React + TSX, gaya proyek ini)

```tsx
const listId = `${id}-listbox`;          // id per field: "origin-listbox"
const optionId = (index: number): string => `${id}-opt-${index}`;

<input
  id={id}
  role="combobox"
  aria-autocomplete="list"
  aria-expanded={open}
  aria-controls={open ? listId : undefined}
  aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
  aria-describedby={`${id}-hint`}
  value={value}
  onChange={onValueChange}
  onKeyDown={onKeyDown}
/>

{open ? (
  <ul id={listId} role="listbox" aria-label="Saran tempat" className="…">
    {results.map((station, index) => (
      <li
        key={station.id}
        id={optionId(index)}
        role="option"
        aria-selected={index === activeIndex}
        className={index === activeIndex ? "bg-surface-2" : "bg-surface"}
      >
        <button type="button" onClick={() => choose(station)} tabIndex={-1}>
          <Highlighted text={station.name} ranges={station.matchedRanges} />
          <span className="text-xs text-ink-3">{subtitle(station)}</span>
        </button>
      </li>
    ))}
  </ul>
) : null}

<div role="status" aria-live="polite" className="sr-only">{announcement}</div>
```

Catatan: `tabIndex={-1}` pada `<button>` di dalam `<li role="option">`
mencegah terbentuknya tab stop kedua; item `option` dibaca dan dipilih lewat
`aria-activedescendant`, bukan lewat tab.

### Menyorot bagian yang cocok

```tsx
function Highlighted({
  text,
  ranges,
}: {
  text: string;
  ranges?: ReadonlyArray<readonly [number, number]>;
}) {
  if (!ranges?.length) return <>{text}</>;

  const out: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(
      <mark key={i} className="bg-transparent font-semibold text-ink underline decoration-accent/40 underline-offset-2">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));

  return <bdi>{out}</bdi>;
}
```

`bg-transparent` menjaga panel tetap bersih; penekanan dilakukan lewat
`font-semibold` + garis bawah accent, supaya tetap terbaca di atas basemap
terang maupun gelap dan tidak bergantung pada warna saja.

---

## Untuk seluler

1. **Daftar menjadi sheet, bukan dropdown.** Di lebar < 640 px, daftar
   dirender sebagai lapisan yang menempel ke bawah layar (`position:
   fixed`, `inset-x-0`, `bottom-0`, `max-height: 60dvh`, `overflow-y:
   auto`, `overscroll-contain`), bukan `absolute` di bawah input.
   Alasannya: keyboard virtual menutup ~40–50 % layar bawah, dan dropdown
   yang menempel pada input akan tertutup keyboard. Sheet yang menempel ke
   bawah selalu terlihat di atas keyboard.
   (*Kebijakan tim; tidak ada sumber primer yang saya baca yang menyatakan
   aturan ini secara eksplisit.*)

2. **Pastikan keyboard virtual tidak menutupi sheet.**
   - Tambahkan `<meta name="viewport" content="… , interactive-widget=resizes-content">`.
     MDN: nilainya bisa `resizes-visual` (bawaan — hanya viewport visual yang
     mengecil, layout viewport tidak), `resizes-content` (viewport ikut
     mengecil) atau `overlays-content`. Tanpa `resizes-content`, sheet
     dihitung terhadap layout viewport yang tidak berubah.
   - Untuk browser yang tidak mendukungnya, ukur `window.visualViewport.height`
     dan `window.visualViewport.offsetTop` (MDN: "User-interface features
     like the on-screen keyboard (OSK) can shrink the visual viewport
     without affecting the layout viewport") lalu pakai untuk menghitung
     tinggi maksimum sheet.
   - Gunakan `dvh`, bukan `vh` dan bukan piksel tetap — aturan yang sama
     sudah berlaku di proyek ini.

3. **Target sentuh minimal 44 × 44 CSS px.** WCAG 2.2 SC 2.5.5 (Level AAA):
   "Make custom targets at least 44 by 44 pixels"; SC 2.5.8 (Level AA)
   menetapkan minimum 24 × 24. Gunakan 44 × 44 untuk target khusus sentuh
   (tombol "bersihkan", tombol "ganti asal/tujuan"), dan tinggi baris
   saran minimal 48 px.

4. **Tidak ada hover di layar sentuh.** Jangan menggunakan `onMouseEnter`
   untuk memindahkan opsi aktif pada perangkat sentuh; pada desktop boleh,
   pada sentuh tidak. Indikator fokus tetap harus terlihat.

5. **Setelah memilih: isi field, tutup sheet, fokus tetap di input.**
   Ini mengikuti APG (fokus tidak keluar dari combobox). Untuk alur
   _asal → tujuan_, berikan tombol eksplisit "S lanjut →" di trailing
   field asal; pengguna tidak boleh dipaksa menebak bahwa ada field kedua.

6. **Jangan biarkan halaman ikut ter-scroll** ketika sheet terbuka. Di HP,
   sheet yang ikut ter-scroll bersama halaman membuat daftar "melompat".
   Kunci scroll body saat sheet terbuka.

7. **Urutkan ulang daftar hanya bila query berubah** — aturan yang sama
   dengan desktop.

8. **Prioritaskan mode.** Di layar kecil, subjudul mode (bus/metro/KRL)
   lebih berguna daripada nama distrik; nama distrik bisa jadi baris ketiga
   kalau ruang cukup.

---

## Yang harus dihindari

| # | Gejala | Penyebab | Perbaikan |
| --- | --- | --- | --- |
| 1 | **Daftar berkedip** — muncul, hilang, muncul lagi tiap ketikan | Keadaan "memuat" mengosongkan daftar lama | Pertahankan hasil sebelumnya saat request baru berjalan (`placeholderData: keepPreviousData` + `isPlaceholderData` dari TanStack Query), tambahkan spinner di trailing field |
| 2 | **Input kehilangan fokus** saat daftar muncul | Fokus DOM dipindahkan ke dalam `ul`/opsi | Fokus DOM **tetap di input**; pindahkan "fokus visual" dengan `aria-activedescendant` (APG) |
| 3 | **Daftar melompat** — baris yang sedang dibaca berubah posisi | Diurutkan ulang pada hover atau saat hasil baru masuk | Bekukan urutan selama string query sama; jangan pernah sort ulang karena hover atau panah |
| 4 | **Dropdown menutupi konten** (peta, tombol "Cari rute") | Panel `absolute` tanpa batas tinggi | Panel punya `max-height` + scroll internal; di mobile jadi sheet; tutup saat halaman di-scroll |
| 5 | **Daftar tetap terbuka** setelah memilih | State `open` tidak direset | Tutup pada pilih, Escape, Tab, dan pointerdown di luar (sudah ada di kode sekarang) |
| 6 | **Tidak ada cara menutup** | Tidak ada Escape, tidak ada klik luar | Escape (tutup, lalu kosongkan), klik luar, tombol "Tutup" di panel |
| 7 | **Satu request per huruf** | Tidak ada debounce | Debounce 250 ms + `AbortSignal` untuk membatalkan request lama |
| 8 | **Hasil lama menimpa hasil baru** (race condition) | Response tidak diurutkan | TanStack Query membatalkan query usang lewat `AbortSignal`; plus penjaga nomor request |
| 9 | **Sorotan berbohong** — bagian yang disorot tidak sebenarnya cocok | UI menebak rentang dari teks fuzzy | Server hanya mengirim `matchedRanges` bila ada bukti token (exact/trigram/prefix); kalau tidak, tidak ada sorotan |
| 10 | **Panel kosong tanpa penjelasan** | Kondisi "kosong" diabaikan | Satu baris: "Tidak ada halte yang cocok dengan “…”" + CTA peta |
| 11 | **`aria-activedescendant` menunjuk id yang tidak ada** | Opsi tidak diberi id | Beri id prediktif pada setiap `li[role=option]` |
| 12 | **Keyboard terkurung** | Fokus dipaksa masuk daftar | Tab harus keluar dari field; popup di luar urutan Tab (APG) |
| 13 | **Halaman ikut ter-scroll** saat memakai panah | Tidak ada `scrollIntoView` | `scrollIntoView({ block: "nearest" })` saat opsi aktif berubah + `overscroll-contain` pada daftar |
| 14 | **Pengguna harus menggulir untuk menemukan yang aktif** | Opsi aktif di luar pandangan | Sama seperti #13 |
| 15 | **Angka skor ditampilkan mentah** | Skor internal bocor ke UI | Skor 0–1 tidak bermakna bagi penumpang; skor tidak ditampilkan sama sekali, hanya urutan dan bagian nama yang dicoret |

### Kesenjangan di kode sekarang (`apps/web/src/features/route-planner/place-input.tsx`)

Yang sudah benar dan boleh dipertahankan: debounce 220 ms, minimum 2
karakter, `limit: 6`, `role="combobox"` + `aria-expanded` + `aria-controls` +
`aria-autocomplete="list"`, tutup saat klik luar, Escape menutup.

Yang perlu diperbaiki:

1. **Tidak ada `aria-activedescendant`** → navigasi panah tidak diumumkan
   screen reader. Perbaiki dengan memberi `id` pada setiap opsi dan
   setel `aria-activedescendant` pada input.
2. **Tidak ada `role="status"`** → jumlah hasil tidak pernah diumumkan.
3. **Tidak ada keadaan "memuat"** → berkedip (anti-pattern #1). Pakai
   `placeholderData: keepPreviousData`.
4. **Tidak ada keadaan "kosong" maupun "gagal"** → panel hilang tanpa
   penjelasan (anti-pattern #10). Di `catch`, jangan diamkan.
5. **`<button>` di dalam `<li role="option">` bisa masuk urutan Tab** →
   tambahkan `tabIndex={-1}`.
6. **Tidak ada sorotan bagian yang cocok** → butuh `matchedRanges` dari API.
7. **Debounce 220 ms → 250 ms** dan tambahkan pembatalan request via
   `AbortSignal`.
8. **Perilaku mobile belum dipisah** → sheet + `interactive-widget`.

---

## Referensi

Semua URL di bawah **saya buka dan baca**. Yang tidak bisa dibaca (halaman
JS) ditandai.

### ARIA & aksesibilitas
| URL | Yang menyumbangkan |
| --- | --- |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ | Definisi pola combobox, empat jenis autocomplete, tabel keyboard lengkap, daftar role/state/properties, catatan `aria-controls` hanya perlu saat popup terlihat |
| https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/ | Tabel atribut per elemen (`aria-activedescendant`, `aria-selected` hanya pada opsi aktif), tabel keyboard,-management `aria-activedescendant` |
| https://raw.githubusercontent.com/w3c/aria-practices/main/content/patterns/combobox/examples/js/combobox-autocomplete.js | Verifikasi bahwa contoh APG **tidak** memakai live region (dasar keputusan memakai `role="status"` sendiri) |
| https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions | `role="status"` = live region implisit `aria-live="polite"`; anjuran announced "polite" |
| https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html | SC 1.4.1: warna bukan satu-satunya pembawa makna |
| https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html | SC 2.5.8 (AA): target minimal 24 × 24 CSS px, atau jarak yang setara |
| https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html | SC 2.5.5 (AAA): target minimal 44 × 44 CSS px |
| https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API | `visualViewport.height` / `offsetTop`; keyboard virtual mengecilkan visual viewport tanpa mengubah layout viewport |
| https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport | Properti `viewport` `interactive-widget`: `resizes-visual` (bawaan) / `resizes-content` / `overlays-content` |

### Mesin pencari & pustaka
| URL | Yang menyumbangkan |
| --- | --- |
| https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/search-as-you-type | Field `search_as_you_type`: subfield shingle `_2gram`/`_3gram` dan `_index_prefix`; query `multi_match` type `bool_prefix` dan `match_phrase_prefix`; `highlight` dengan `matched_fields` termasuk `_index_prefix` (dasar sorotan prefiks) |
| https://www.elastic.co/docs/reference/search-ui/api-react-components-search-box | `searchAsYouType` ("executes a new search query with every key stroke") + parameter `debounceLength` ("avoid creating an excessive number of requests"); Search UI dibangun di atas **Downshift** |
| https://www.elastic.co/docs/reference/search-ui/solutions-ecommerce-autocomplete | Pola dropdown autocomplete: bisa menampilkan beberapa sumber saran sekaligus (query suggestion + hasil + daftar query populer) |
| https://www.elastic.co/docs/reference/search-ui/guides-using-search-as-you-type | Halaman panduan "Using search-as-you-type" (diambil; sebagian besar isinya nav, dipakai hanya sebagai verifikasi existence) |
| https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-suggesters | Saran "maksudkan ini": phrase suggester `highlight.pre_tag`/`post_tag` (default `<em>`), `collate` untuk memangkas saran yang tidak ada dokumennya, `collate_match`, `suggest_mode`, `confidence`, `max_errors` |
| https://www.algolia.com/doc/api-reference/widgets/search-box/js | Widget `searchBox` InstantSearch: `searchAsYouType` default `true`, `queryHook` (tempat debounce), `ignoreCompositionEvents` (IME), `showLoadingIndicator` default `true` |
| https://www.algolia.com/doc/guides/building-search-ui/what-is-instantsearch/js | Gambaran umum InstantSearch (diambil; dipakai sebagai konteks) |
| https://www.algolia.com/blog/engineering/inside-the-algolia-engine-part-5-highlighting-a-cornerstone-to-search-ux | Bukti kualitatif bahwa menyorot hasil adalah komponen penting UX pencarian; menjelaskan kenapa menyorot itu penting saat ada sinonim/typo-tolerance |
| https://www.algolia.com/blog/engineering/our-secret-recipe-for-speed-from-search-as-you-type-to-ai-search | Latar belakang performa "search-as-you-type" (diambil; dipakai sebagai konteks, tidak untuk angka) |
| https://www.downshift-js.com/ dan https://www.downshift-js.com/use-combobox | Implementasi referensi pola ARIA combobox (Downshift; dasar Search UI Elastic) |
| https://react-spectrum.adobe.com/react-aria/ComboBox.html | Implementasi referensi React Aria ComboBox (diambil; teks halaman sebagian besar nav, dipakai sebagai pointer implementasi) |
| https://react-spectrum.adobe.com/react-aria/useComboBox.html | Hook `useComboBox` React Aria (diambil; halaman dirender JS, isi tidak terbaca) |
| https://mui.com/material-ui/react-autocomplete/ | Properti `Autocomplete` MUI: `disablePortal`, `filterToQuery`, atribut ARIA yang dihasilkan (`aria-autocomplete="list"`, `aria-expanded`), `noOptionsText` |
| https://react.dev/reference/react/useDeferredValue | "There is no fixed delay caused by useDeferredValue itself"; render latar dapat diinterupsi saat pengguna mengetik — alasan utama debounce tetap harus eksplisit |
| https://tanstack.com/query/latest/docs/framework/react/guides/placeholder-query-data | `placeholderData` + flag `isPlaceholderData` — alat untuk mencegah daftar berkedip |
| https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation | `AbortSignal` yang disediakan TanStack Query untuk membatalkan query usang |
| https://docs.mapbox.com/api/search/search-box/ | Pola autocomplete Mapbox: endpoint `/suggest` + `/retrieve`, `limit` maksimum 10, `proximity`/`bbox`/`types`/`language`, `session_token`, rate limit 10 request/detik |
| https://docs.mapbox.com/mapbox-search-js/ | Pustaka klien Mapbox Search (diambil; dirender JS) |

### Tidak berhasil dibaca (TIDAK dipakai sebagai sumber)
| URL | Kenapa |
| --- | --- |
| https://baymard.com/blog/search-autocomplete | Balas halaman `__next_error__` — isi artikel tidak dapat diakses |
| https://developer.apple.com/design/human-interface-guidelines/layout | Hanya dirender JavaScript; teks tidak terbaca |
| https://web.dev/articles/accessible-tap-targets | Hanya dirender JavaScript; teks tidak terbaca |
| https://www.nngroup.com/articles/autocomplete/ | 404 |
| https://web.dev/articles/debounce | 404 |
