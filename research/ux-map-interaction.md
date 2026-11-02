# UX interaksi peta — Daily Route

Panduan ini untuk peta rute di Daily Route: satu peta MapLibre GL JS yang
menampilkan **garis rute** (Transjakarta, MRT, LRT Jakarta, LRT Jabodebek,
KRL), **titik halte**, dan **titik transit** (halte yang dilayani lebih dari
satu sistem).

**Cara membaca angka di dokumen ini.** Setiap angka disebut sumbernya.
Kalau angka itu **kebijakan tim** dan bukan hasil dari sumber yang saya baca,
ditandai tegas sebagai *kebijakan tim*. Saya tidak menemukan angka baku dari
sumber primer untuk durasi animasi dan lebar garis optimum — jadi angka itu
saya tetapkan sendiri, dengan alasannya.

> **Catatan metode.** `web_search` di lingkungan ini mengembalikan
> `HTTP 401`, jadi semua sumber diambil langsung lewat HTTP dan dibaca satu
> per satu. Halaman yang hanya dirender JavaScript (Apple HIG, web.dev,
> React Aria, Primer) **tidak** saya pakai sebagai sumber angka apa pun.

---

## Prinsip

1. **Peta adalah pelengkap, daftar halte adalah sumbernya.** Peta
   digambar di kanvas; titik-titiknya tidak bisa dijangkau keyboard. Setiap
   informasi yang ada di peta harus juga ada di daftar (itinerary) di
   sebelahnya, sebagai padanan keyboard. (*Kebijakan tim — tidak ada
   sumber primer yang saya baca yang menyatakannya untuk peta; WCAG 1.1.1
   mewajibkan fungsi yang dapat dioperasikan keyboard, dan "gambar" di
   kanvas WebGL tidak menyediakan keyboard.)

2. **Hover memberi informasi, klik memberi navigasi.** Tooltip hanya
   menjawab "apa ini?"; klik harus selalu melakukan sesuatu yang berarti
   (menyorot, memusatkan kamera, membuka detail). (*Kebijakan tim; konsisten
   dengan pola yang dipakai contoh resmi MapLibre "Display a popup on
   hover" dan "Display a popup on click".*)

3. **Gerak kamera adalah instrumen, bukan dekorasi.** MapLibre otomatis mengubah
   animasi menjadi lompatan saat pengguna mengaktifkan reduced motion —
   kecuali `essential: true`. Jadi `essential: true` berarti "gerakan ini
   bermakna"; memakainya untuk dekorasi berarti menabangi
   preferensi `prefers-reduced-motion`.

4. **Warna adalah satu dari beberapa pembawa makna.** WCAG 2.2 SC 1.4.1
   (Level A): "Color is not used as the only visual means of conveying
   information". Setiap mode karena itu punya warna **dan** pola garis
   **dan** label.

5. **Target sentuh di peta adalah eksplisit, bukan hasil samping.** Titik
   halte yang digambar 6 px bukan target sentuh 6 px. WCAG 2.2 SC 2.5.8
   (AA) minta minimal 24 × 24 CSS px; SC 2.5.5 (AAA) minta 44 × 44.

6. **Satu mode = satu warna, di mana-mana.** DESIGN.md: "Mode colours are
   data, not decoration: a bus is always the bus colour." Peta, legenda,
   chip di daftar, dan itinerary memakai token yang sama.

---

## Perilaku yang direkomendasikan

### 1. Hover pada garis rute atau titik halte → **popup**, bukan tooltip

Popup (kotak isi) dipilih karena isinya lebih dari satu baris; tooltip
hanya untuk label pendek satu baris.

Opsi `Popup` yang dipakai (nilai bawaan MapLibre di dalam kurung):

```ts
const popup = new Popup({
  closeButton: false,        // (true) popup hover tidak punya tombol tutup
  closeOnClick: false,       // (true) klik peta tidak menutup popup hover
  closeOnMove: true,         // (false) popup ditutup saat kamera bergerak
  focusAfterOpen: false,     // (true) PENTING: jangan rebut fokus keyboard
  maxWidth: "260px",         // (240px)
  className: "popup-stop",
});
```

`focusAfterOpen: false` itu wajib untuk popup hover: bawaannya `true`, yang
berarti popup akan mencoba memfokuskan elemen pertamanya — dari hover mouse
itu akan merebut fokus dari kontrol yang sedang dipakai pengguna.

Pola yang dipakai (mengikuti contoh resmi MapLibre "Display a popup on
hover"):

```ts
let currentFeatureId: string | undefined;

map.on("mousemove", "stations-hit", (event) => {
  const feature = event.features?.[0];
  if (!feature) return;

  const id = String(feature.properties?.id);
  if (id !== currentFeatureId) {
    currentFeatureId = id;
    map.getCanvas().style.cursor = "pointer";
    popup.setLngLat(event.lngLat).setDOMContent(renderStopCard(feature)).addTo(map);
  } else {
    popup.setLngLat(event.lngLat);
  }
});

map.on("mouseout", "stations-hit", () => {
  currentFeatureId = undefined;
  map.getCanvas().style.cursor = "";
  popup.remove();
});
```

Dua hal dari contoh resmi yang layak ditiru:

- **Bandingkan koordinat/identitas fitur, bukan hanya koordinat.** Contohnya
  menyimpan `currentFeatureCoordinates` dan hanya membangun ulang popup
  kalau fiturnya benar-benar berganti — tanpa ini, popup dibuat ulang pada
  setiap mousemove.
- **Perbaiki posisi popup agar muncul di atas salinan fitur yang sedang
  ditunjuk** saat peta di-zoom ke tingkat dunia (contoh resmi menggeser
  `coordinates[0]` sebesar ±360° sampai selisihnya < 180°).

**Isi popup (kartu halte)** — empat baris, tidak lebih:

```
Bundaran Senayan                        ← 15 px, semibold, ink
Transjakarta · 4 garis                  ← 12 px, ink-3
1 · 2 · 9 · 16 · MRT Jakarta            ← 11 px, ink-3, nama garis
± 120 m dari Anda                       ← 11 px, ink-3 (bila koordinat ada)
```

- Nama halte, nama sistem/operator, nama garis yang lewat, dan jarak bila
  koordinat pengguna diketahui.
- **Tidak ada** durasi, tidak ada estimasi, tidak ada tarif di dalam popup.
  Semua itu milik itinerary, dan AGENTS.md melarang interface mengarang
  angka.
- Satu aksi utama boleh ada: "Tambah sebagai asal" / "Tambah sebagai
  tujuan". Tapi aksi yang sama harus ada di daftar halte — jangan
  menjadikannya satu-satunya jalan.

**Hover tidak berlaku di layar sentuh.** Di sana, tap membuka isi yang
sama — sebagai kartu di bawah peta (bottom sheet), bukan popup yang
mengambang di atas titik yang sedang ditekan. Alternatifnya
`popup.trackPointer()` ("Tracks the popup anchor to the cursor position on
screens with a pointer device (it will be hidden on touchscreens)") hanya
untuk tooltip satu baris, dan tetap tidak pengganti UI sentuh.

### 2. Klik → perbesar ke halte: `easeTo` vs `flyTo` vs `jumpTo`

Ketiganya ada di `Map` (bukan kelas terpisah — MapLibre tidak punya kelas
`Camera` di dokumentasi API; metode kamera ada di `Map`):

| Metode | Perilaku | Kapan dipakai |
| --- | --- | --- |
| `map.jumpTo(options)` | "Changes any combination of center, zoom, bearing, pitch, and roll, **without an animated transition**." | Hanya untuk posisi awal (`initialState`) atau pembaruan data yang bukan hasil interaksi pengguna. **Jangan** untuk klik. |
| `map.easeTo(options)` | "Changes any combination of center, zoom, bearing, pitch, roll, **and padding** with an animated transition between old and new values." | **Klik pada satu halte.** Gerak lurus, singkat, tidak membingungkan orientasi. |
| `map.flyTo(options)` | Mengubah center/zoom/bearing/pitch/roll "animating the transition along a **curve that evokes flight**" | Hanya untuk lompatan jauh (antar-kota). Untuk satu halte, ini berlebihan. |
| `map.fitBounds(bounds, options)` | "Pans and zooms the map to contain its visible area within the specified geographical bounds." **Menyetel bearing ke 0.** | Menampilkan seluruh rute (bukan satu titik). |

Aturan numeriknya (*kebijakan tim* — MapLibre tidak mempublisitkan durasi
"bagus"):

```ts
// Klik satu halte: selalu easeTo.
map.easeTo({
  center: [station.longitude, station.latitude],
  zoom: Math.max(map.getZoom(), 15),   // jangan zoom-out
  duration: 400,                        // ms
  padding: { top: 80, bottom: 120, left: 40, right: 40 },
  essential: false,
});

// Lompatan jauh (mis. buka rute dari kota lain): flyTo.
map.flyTo({
  center: [lng, lat],
  zoom: 14,
  duration: 1000,          // ms
  curve: 1.42,            // nilai bawaan MapLibre (van Wijk 2003)
  speed: 1.2,             // nilai bawaan MapLibre
  maxDuration: 2000,      // ms — batasi agar tidak terlalu lama
  essential: false,
});
```

Opsi yang perlu dikenal (dari definisi tipe resminya di
`src/ui/camera.ts`):

| Opsi | Tipe | Arti |
| --- | --- | --- |
| `duration` | `number` | "The animation's duration, measured in milliseconds." |
| `easing` | `(_: number) => number` | Fungsi waktu 0..1 → 0..1. |
| `animate` | `boolean` | "If `false`, no animation will occur." |
| `essential` | `boolean` | "If `true`, then the animation is considered essential and will not be affected by `prefers-reduced-motion`." |
| `offset` | `PointLike` | "of the target center relative to real map container center at the end of animation." |
| `padding` | `number \| PaddingOptions` | Piksel: `{ top, bottom, left, right }`. |
| `zoom`, `center`, `bearing`, `pitch`, `roll` | — | `CameraOptions`. |
| `curve` | `number` | Bawaan `1.42` (FlyToOptions). |
| `speed` | `number` | Bawaan `1.2` — "the map appears to move along the flight path by 1.2 times options.curve screenfulls every second". |
| `maxDuration` | `number` | "The animation's maximum duration, measured in milliseconds." |

Tiga aturan yang tidak bisa ditawar:

1. **`essential` default-nya `false` dan harus tetap `false`.** Dokumentasi
   MapLibre: `easeTo` "will happen instantly if the user has enabled the
   reduced motion accessibility feature … unless options includes
   `essential: true`", dan `flyTo` "will be skipped, and this will behave
   equivalently to `jumpTo`" untuk kondisi yang sama. Biarkan
   preferensi sistem menang; `essential: true` hanya sah bila gerak itu
   memang membawa informasi yang tidak bisa disampaikan diam-diam. Dalam
   aplikasi ini, kasusnya hampir tidak ada.
2. **Jangan pernah zooming-out** saat memusatkan kamera ke halte —
   `zoom: Math.max(map.getZoom(), 15)`. Kalau zoom dikecillin, pengguna
   kehilangan konteks.
3. **Selalu isi `padding`.** Tanpa padding, halte bisa tertutup header di
   atas atau bottom sheet di bawah. Di desktop cukup `{ top: 80, bottom: 40 }`;
   di mobile, bagian bawah dikurangi oleh sheet: `{ top: 80, bottom: 120 }`.
4. **`fitBounds` hanya saat perjalanan yang diikuti berubah**, termasuk
   saat satu bagian perjalanan dipilih di daftar. `idle` dan `styledata`
   menyala lagi setelah pembaca selesai zoom, dan juga saat cat lapisan
   berubah. Memasang `fitBounds` atau menggambar ulang garis di sana
   membuat rute berkedip. Zoom dan geser milik pembaca sampai pilihan
   berganti.
   (*Kebijakan tim*, sama dengan peta navigasi yang tidak merebut kamera
   setelah gestur.)

### 3. Target sentuh di peta: **44 × 44 CSS px**

Angka ini dari WCAG: SC 2.5.8 (Level AA) "The size of the target for
pointer inputs is at least 24 by 24 CSS pixels"; SC 2.5.5 (Level AAA) "at
least 44 by 44 CSS pixels". Untuk peta di tangan, pakai **44 × 44**.

Masalahnya: layer `circle` menggambar lingkaran dengan radius
`circle-radius` piksel, dan itu **adalah** area hit-nya. Lingkaran
`circle-radius: 6` berarti target 12 px — jauh di bawah minimum.

Cara memperbesar area hit tanpa memperbesar simbol:

**(a) Layer circle tak terlihat sebagai "hit area".** Layer dengan
`circle-opacity: 0` tetap ikut hit — dokumentasi `queryRenderedFeatures`
memberi tahu secara eksplisit: "Features from all other layers are
included, including features that may have no visible contribution to the
rendered result; for example, because the layer's opacity or color alpha
component is set to 0."

```ts
// Layer visual: kecil.
{ id: "stations", type: "circle", source: "stations",
  paint: { "circle-radius": 6, "circle-color": ["get", "modeColour"] } }

// Layer hit: tidak terlihat, radius 22 → target 44 px.
{ id: "stations-hit", type: "circle", source: "stations",
  paint: { "circle-radius": 22, "circle-opacity": 0 } }
```

**(b) Perlebar area kueri dengan kotak piksel.** `queryRenderedFeatures`
menerima "a single pixel point or a pair of top-left and bottom-right pixel
points describing a bounding box":

```ts
const HALF = 22; // 44 px / 2
const box: [[number, number], [number, number]] = [
  [point.x - HALF, point.y - HALF],
  [point.x + HALF, point.y + HALF],
];
const features = map.queryRenderedFeatures(box, { layers: ["stations-hit"] });
```

**(c) Untuk halte yang wajib bisa difokuskan keyboard, pakai DOM
`Marker`, bukan layer kanvas.** MapLibre memberi marker dengan popup
`tabindex="0"` dan `role="button"` (diverifikasi di `src/ui/marker.ts`:
"Non-interactive markers use `role=img`; interactive ones (draggable or
with a popup) use `role=button`", dan `_updateTabIndex` menambahkan
`tabindex="0"` bila marker punya popup). Layer simbol di kanvas tidak
memberi apa pun ke accessibility tree.

```ts
const marker = new Marker({ element: buttonEl, anchor: "bottom" })
  .setLngLat([lng, lat])
  .setPopup(new Popup({ offset: 12 }))
  .addTo(map);
```

**Catatan penting soal layer `symbol`:** style spec MapLibre **tidak**
memiliki `icon-hitbox` / `text-hitbox` (saya verifikasi: kata "hitbox" tidak
muncul di halaman style spec). Jadi area hit symbol tidak bisa diperbesar
secara deklaratif — harus lewat (a)/(b)/(c).

### 4. Warna per mode: warna + pola + label

**Palet** — pakai token yang sudah ada di DESIGN.md, dan pilih kolom sesuai
basemap:

| Mode | Token | Basemap terang | Basemap gelap |
| --- | --- | --- | --- |
| Transjakarta (semua kelas) | `mode-bus` | `#0b6b4f` | `#4ade9e` |
| MRT Jakarta | `mode-metro` | `#1d4ed8` | `#93b4fd` |
| LRT Jakarta | `mode-tram` | `#c2410c` | `#fb923c` |
| LRT Jabodebek | `mode-lrt-jabodebek` | `#6d28d9` | `#a78bfa` |
| KRL Jabodetabek | `mode-rail` | `#334155` | `#94a3b8` |

Aturan: **tidak pernah mencampur kolom.** Garis `#334155` di atas basemap
gelap nyaris tidak terlihat; begitulah sebaliknya. Karena tema aplikasi
adalah token swap, style peta harus dibangun ulang saat tema berubah —
`styleFor(theme)` sebagai satu fungsi, dan tidak ada hex di dalam
komponen.

**Warna saja tidak cukup** (WCAG 1.4.1). Setiap mode mendapat kanal lain:

| Mode | `line-dasharray` (px) | `line-width` (px) |
| --- | --- | --- |
| Transjakarta | solid (tanpa `line-dasharray`) | 4 |
| MRT Jakarta | solid | 5 |
| LRT Jakarta | `[2, 2]` | 4 |
| LRT Jabodebek | `[6, 2]` | 5 |
| KRL Jabodetabek | `[4, 2, 1, 2]` (dash-dot) | 3 |

Angka dash/width di atas adalah *kebijakan tim*; yang diverifikasi dari
style spec MapLibre adalah satuan dan makna property-nya (`line-dasharray`
= deretan angka dalam piksel; `line-width` = "Stroke thickness", satuan
piksel, bawaan 1).

Tiga property pendukung yang membuat garis terbaca di atas basemap apa pun:

- **`line-gap-width`** — "Draws a line casing outside of a line's actual
  path." Isi dengan warna permukaan (`bg` / `surface`), bikin 1–2 px
  outline putih/gelap di sekeliling garis.
- **`text-halo-width`** — "Distance of halo to the font outline. **Max text
  halo width is 1/4 of the font-size.**" Pakai `text-halo-color` = warna
  basemap, supaya label nama garis terbaca di atas garis apa pun.
- **Ketebalan minimum 3 px.** WCAG 1.4.11 (AA) meminta rasio kontras ≥ 3:1
  untuk "Graphical Objects" yang diperlukan untuk memahami isi — dan style
  spec memperingatkan sendiri bahwa "thin lines and shapes … may be
  rendered … with a much lower contrast in practice" karena anti-aliasing.

### 5. Menandai titik transit (interchange)

**Bentuknya harus berbeda, bukan hanya warnanya.** Bentuk yang dipakai
(*kebijakan tim*):

- **Halte biasa** — titik kecil solid (lingkaran `circle-radius` 5–6 px).
- **Titik transit** — cincin: lingkaran luar radius 9 px dengan `circle-stroke-width`
  2 px, plus glyph "pertukaran" di tengahnya, digambar sebagai layer
  `symbol` terpisah di atas garis rute.

Lapisan dan urutannya:

```ts
{ id: "transit-points", type: "symbol", source: "stations",
  layout: {
    "icon-image": "interchange",
    "icon-allow-overlap": true,     // titik transit tidak boleh hilang
    "icon-ignore-placement": true,
    "symbol-sort-key": 10,          // di atas symbol & line biasa
  } }
```

`symbol-sort-key` mengatur urutan gambar antar layer symbol; `symbol-z-order`
mengatur urutan dalam satu layer. Titik transit harus berada di atas garis
dan di atas label halte biasa.

**Isi hover / tooltip titik transit:**

```
Bundaran Senayan · Titik transit
Transjakarta 1, 2, 9, 16 · MRT Jakarta
4 garis, 2 sistem
```

- Sebut **nama** setiap garis, bukan hanya warnanya — "4 garis" tanpa nama
  tidak berguna bagi penumpang yang mencari KRL.
- Sebut **jumlah sistem** ("2 sistem"), itu informasi yang paling penting:
  inilah nilai titik transit.
- Bila titik transit punya nama yang berbeda di tiap sistem (misalnya
  "Bundaran HI ASTRA" vs "Bundaran HI"), tampilkan nama yang dipakai
  pengguna sistem tersebut, dan cantumkan nama lain sebagai catatan.

### 6. Yang tidak boleh ada di peta

- **Tidak ada informasi yang hanya ada di hover.** Hover tidak ada di
  layar sentuh dan tidak ada untuk pengguna keyboard. Isi hover harus
  duplikat di daftar halte.
- **Tidak ada popup yang merebut fokus.** `focusAfterOpen: false` untuk
  popup hover.
- **Tidak ada `jumpTo` yang dipicu pengguna** — lompatan seketika terasa
  seperti error.
- **Tidak ada `essential: true` untuk animasi dekoratif.**
- **Tidak ada warna tanpa label** di legenda maupun di peta.

---

## Referensi

Semua URL di bawah **saya buka dan baca**.

| URL | Yang menyumbangkan |
| --- | --- |
| https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/ | Definisi `flyTo`, `easeTo`, `jumpTo`, `fitBounds`, `queryRenderedFeatures`, `project`, `unproject`; perilaku reduced motion (`essential`); `queryRenderedFeatures` memasukkan layer dengan opacity 0 |
| https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/ui/camera.ts | Definisi tipe resmi: `AnimationOptions` (`duration`, `easing`, `offset`, `animate`, `essential`), `CameraOptions` / `CenterZoomBearing`, `FlyToOptions` (`curve` 1.42, `speed` 1.2, `maxDuration`, `minZoom`), `EaseToOptions` (`padding`, `around`, `delayEndEvents`), `JumpToOptions` (`padding`) |
| https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/geo/edge_insets.ts | Bentuk `PaddingOptions`: `{ top, bottom, left, right }` dalam piksel |
| https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/ui/popup.ts | Opsi `Popup`: `closeButton` (true), `closeOnClick` (true), `closeOnMove` (false), `focusAfterOpen` (true), `anchor`, `offset`, `className`, `maxWidth` ('240px') |
| https://maplibre.org/maplibre-gl-js/docs/API/classes/Popup/ | Metode `Popup`: `setLngLat`, `setDOMContent`, `setHTML`, `setText`, `setMaxWidth`, `setOffset`, `setPadding`, `addTo`, `remove`, `toggleClassName`, `trackPointer` ("hidden on touchscreens") |
| https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/src/ui/marker.ts | `Marker` memberi `tabindex="0"` dan `role="button"` bila punya popup, `role="img"` bila tidak interaktif; elemen marker kustom dibiarkan ke aplikasi |
| https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/ | Metode `Marker`: `getElement`, `setPopup`, `togglePopup`, `setLngLat`, `addTo`, `remove` |
| https://maplibre.org/maplibre-style-spec/layers/ | Properti layer: `line-width` (px, bawaan 1), `line-dasharray`, `line-gap-width` (casing), `line-blur`, `circle-radius`, `circle-stroke-width`, `circle-opacity`, `text-halo-width` (maks. 1/4 ukuran font), `text-halo-color`, `symbol-sort-key`, `symbol-z-order`, `icon-allow-overlap`, `icon-ignore-placement`. **Verifikasi negatif:** tidak ada `icon-hitbox`/`text-hitbox` di spec ini |
| https://maplibre.org/maplibre-gl-js/docs/examples/display-a-popup-on-hover/ | Pola hover resmi: `map.on('mousemove', layerId, …)`, bandingkan koordinat fitur sebelum membangun ulang popup, `map.getCanvas().style.cursor = 'pointer'`, koreksi ±360° saat fitur di-zoom-out |
| https://maplibre.org/maplibre-gl-js/docs/examples/display-a-popup-on-click/ | Pola klik resmi untuk membuka popup |
| https://maplibre.org/maplibre-gl-js/docs/examples/animate-map-camera-around-a-point/ | Contoh animasi kamera (`flyTo`/`easeTo`) |
| https://maplibre.org/maplibre-gl-js/docs/examples/customize-camera-animations/ | Contoh kustomisasi `easing`/`duration` pada animasi kamera |
| https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html | SC 2.5.8 (AA): target minimal 24 × 24 CSS px, atau spacing yang setara; pengecualian "Essential" untuk peta digital ("in digital maps, the position of pins is analogous to the position of places shown on the map") |
| https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html | SC 2.5.5 (AAA): target minimal 44 × 44 CSS px |
| https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html | SC 1.4.1 (A): warna bukan satu-satunya pembawa makna |
| https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html | SC 1.4.11 (AA): rasio kontras ≥ 3:1 untuk "Graphical Objects" dan komponen UI; peringatan bahwa garis tipis bisa tampil jauh lebih pucat karena anti-aliasing |

### Tidak berhasil dibaca (TIDAK dipakai sebagai sumber)
| URL | Kenapa |
| --- | --- |
| https://developer.apple.com/design/human-interface-guidelines/layout | Hanya dirender JavaScript; teks tidak terbaca |
| https://web.dev/articles/accessible-tap-targets | Hanya dirender JavaScript; teks tidak terbaca |
| https://www.mapbox.com/blog/designing-more-accessible-maps | 404 |
| https://docs.mapbox.com/help/getting-started/accessibility/ | 404 |
