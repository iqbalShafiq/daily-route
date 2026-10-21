# Pola tata letak aplikasi rute transit

Riset untuk mengganti pola **app bar atas + panel kiri** pada *Daily Route*.
Tanggal riset: 21 Oktober 2026. Semua klaim diberi tautan. Klaim dipisah
menjadi dua golongan:

- **[DOK]** — dokumentasi resmi, design system, atau halaman produk.
- **[OPINI]** — pengamatan, kritik desain, artikel pihak ketiga, atau
  dokumentasi skrining aplikasi yang bukan pernyataan resmi.

Angka yang tidak bisa diverifikasi ditandai **[BELUM TERVERIFIKASI]**.

Spesifikasi mesin dari laporan ini ada di
[`ux-layout-patterns.spec.json`](ux-layout-patterns.spec.json). Tiga prototipe
ada di [`prototypes/`](prototypes/).

---

## 1. Ringkasan eksekutif

1. **Peta adalah layar utama, bukan pelengkap.** Hampir semua aplikasi transit
   yangreviewed serius_uuid—Citymapper, Transit, Moovit, HERE WeGo, TfL Go,
   MyTransport.SG, KakaoMetro—membuka peta, bukan formulir. Yang berbeda
   adalah *dari mana* pencarian dimulai, bukan apakah peta ada.
2. **App bar atas bukan lagi default.** Aplikasi transit modern memindahkan
   kontrol ke atas peta (tombol tema, lokasi, status) dan memberi ruang
   navigasi ke tab bar di bawah pada mobile. Apple sendiri menulis bahwa
   navigation bar sebaiknya translucent dan dapat disembunyikan
   ([DOK, HIG Navigation bars](https://codershigh.github.io/guidelines/ios/human-interface-guidelines/ui-bars/navigation-bars/index.html)).
3. **Tiga cara yang terbukti bekerja**, dan semuanya sudah dipraktikkan:
   peta penuh + panel mengambang (Transit, Citymapper), peta penuh + bottom
   sheet (Google Maps, Apple Maps), dan layar pencarian terpisah lalu peta
   (SNCF Connect, Transit).
4. **Rekomendasi: Konsep A** untuk Daily Route, dengan **Konsep B** sebagai
   alternatif mobile dan **Konsep C** sebagai alternatif untuk lintah
   "belum tahu mau ke mana".
5. **Angka kunci** — app bar **0 px** (tidak ada), panel hasil **400 px**
   (desktop) / **46 % tinggi layar** (mobile), sheet **peek 30 % / half 55 % /
   full 92 %**, radius **14 px** (kartu) dan **16 px** (sudut atas sheet),
   breakpoint aplikasi **900 px**.

---

## 2. Pola layout yang dipakai aplikasi transit terbaik

### 2.1 Tabel per aplikasi

| Aplikasi | Peta | Pencarian | Hasil itinerary | Sumber |
| --- | --- | --- | --- | --- |
| **Transit** (Transit Tech) | Peta interaktif penuh; planning panel **melayang**; trip results list di panel yang sama; peta tetap bisa digeser | Tiga cara: lokasi sekarang, cari-pilih, klik peta | "Timebar" per opsi; yang terbaik di atas | [DOK] [Trip planner for desktop](https://help.transitapp.com/article/534-trip-planner-for-desktop) |
| **Citymapper** | Peta sebagai layar utama; "Get Me Somewhere" sebagai ajakan bertindak di layar awal | Kotak pencarian di layar awal, mode filter (Classic, Walk Less, Turbo, Price, Step-Free) sebagai tab/filter | Daftar di layar, dengan mode filter sebagai progressive disclosure | [OPINI] [Pratt design critique](https://ixd.prattsi.org/2026/02/design-critique-citymapper-ios-app), [OPINI] [Page Flows](https://pageflows.com/ios/products/citymapper) |
| **Moovit** | Peta dengan "Near Me"; "En Route"atmauttrial tracking di atas peta | **OmniSearch bar** di layar beranda; "Smart Cards" di bawahnya sebagai saran personal | Hasil perjalanan + leg per perjalanan | [DOK] [Moovit press release](https://moovit.com/press-releases/cross-regional-journey-planner), [OPINI] [Metro Magazine](https://www.metro-magazine.com/news/moovit-launches-personalized-journeys-in-112-countries) |
| **HERE WeGo** | Peta penuh; **semua kontrol di bawah layar** (titik rute, moda, layer); tab bawah bisa dibuka untuk menampilkan pilihan rute | Busur bawah yang bisa dimebangkan | Panel bawah yang sama | [OPINI] [MSPowerUser](https://mspoweruser.com/here-wego-vs-google-maps), [DOK] [HERE WeGo](https://www.here.com/products/wego) |
| **Google Maps** | Peta penuh | Search bar di atas | **Bottom sheet** tiga detent; peta tetap hidup di belakang sheet | [OPINI] [Dove Letter](https://doveletter.dev/articles/flexible-bottomsheet-google-maps), [OPINI] [Turo Engineering](https://medium.com/turo-engineering/adjusting-compose-google-map-while-bottom-sheet-moves-4a7465305137) |
| **Apple Maps** | Peta dengan search bar **di bawah** pada iPhone | Search bar di bawah | Panel Directions; web memakai **navigasi pane di kiri** | [OPINI] [WIRED](https://www.wired.com/story/how-to-use-apple-maps-on-the-web), [DOK] [HIG Maps](https://developer.apple.com/design/human-interface-guidelines/maps) |
| **TfL Go** | Live map + status gangguan | Form "plan a journey" | Kartu hasil di dalam aplikasi; fokus pada disruptions | [DOK] [TfL Go](https://tfl.gov.uk/maps_/tfl-go), [OPINI] [App Store review](https://apps.apple.com/gb/app/tfl-go-plan-pay-travel/id1419541638) |
| **Transport for NSW (Opal Travel)** | Live map dan planner | Perjalanan door-to-door | Daftar hasil + notifikasi gangguan | [DOK] [transportnsw.info](https://transportnsw.info/plan/transport-apps) |
| **MyTransport.SG (LTA)** | Live traffic + peta MRT/LRT | Journey Planner multi-moda | Hasil rute + fare calculator | [DOK] [LTA MyTransport.SG](https://www.lta.gov.sg/content/dam/ltagov/Home/PDF/MTM.pdf) |
| **Seoul / Kakao** | Peta sebagai default; KakaoMetro menyediakan peta subway berbasis lokasi sebenarnya | Pencarian stasiun | Rute tercepat + transfer + info gerbong | [OPINI] [KakaoMetro App Store](https://apps.apple.com/us/app/kakaometro/id1095533900), [DOK] [Seoul Metropolitan Government](https://english.seoul.go.kr/service/movement/public-transportation) |
| **DB Navigator** | Peta hanya di menu "Nearby"; **inti aplikasi adalah daftar** koneksi, bukan peta | Pencarian rute | Daftar koneksi + detail perjalanan | [OPINI] [traintrackapp.de](https://traintrackapp.de/en/blog/db-navigator-vs-train-tracking-apps), [DOK] [bahn.de](https://int.bahn.de/en/booking-information/db-navigator) |
| **SNCF Connect** | Peta bukan layar awal; pencarian lebih dulu | Layar beranda + halaman pencarian terpisah | Halaman hasil dengan bar tetap berisi pencarian, tanggal, dan filter | [OPINI] [Redesign critique](https://medium.com/@chhunestelle/sncf-connect-redesign-challenge-549c9f1ea1f9), [DOK] [SNCF itineraries](https://www.sncf-voyageurs.com/en/travel-with-us/timetables-and-itineraries/itineraries) |
| **MTA / BART** | Peta dan status layanan; **Live in-app customer support** | Perjalanan dari titik ke titik |-itinerary | [DOK] [MTA apps](https://www.mta.info/guides/apps), [DOK] [BART apps](https://www.bart.gov/guide/apps) |
| **Klook / Grab / Traveloka** | Bukan aplikasi rute; peta bukan layar utama. Formulir + daftar produk + peta sebagai alat bantu | Formulir di layar beranda | Daftar kartu produk | [OPINI] [uxdesign.cc — Grab transport](https://uxdesign.cc/redesigning-the-transport-booking-experience-for-grab-app-52fbe796c36c), [OPINI] [Traveloka Cars redesign](https://dhea.works/works/redesigning-traveloka-cars) |

### 2.2 Temuan yang bisa dipakai

**Temuan 1 — "Peta layar utama" bukan dogma, tapi default yang kuat.**
Peta adalah layar utama pada Citymapper, Moovit, HERE WeGo, Google Maps,
Apple Maps, TfL Go, dan MyTransport.SG. Peta **bukan** layar utama pada
DB Navigator ([OPINI]-traintrackapp: aplikasi "berpikir dalam perjalanan untuk
penumpang, bukan rincian gerak untuk pengamat") dan SNCF Connect
([OPINI] redesign critique: ada 8 halaman sebelum hasil). Artinya: **peta
hanya boleh dominating jika produknya mencari rute**; kalau produknya
menjual tiket, daftar lebih tepat.

**Temuan 2 — Hasil dan peta hampir selalu berdampingan, tidak bergantian.**
Hampir semua aplikasi di atas menampilkan peta dan daftar hasil pada saat
yang sama. Yang berbeda hanya bentuknya: panel mengambang (Transit),
bottom sheet (Google Maps), sidebar web (Apple Maps web, [OPINI] WIRED),
atau daftar penuh dengan peta sekunder (DB Navigator).

**Temuan 3 — Panel mengambang adalah pola yang sudah terbukti, bukan
eksperimen.** Transit memakai "planning panel" yang melayang di atas peta dan
mempertahankan peta tetap interaktif ([DOK] help.transitapp.com). Pola yang
sama dipakai HERE WeGo yang memindahkan semua kontrol ke bawah layar
([OPINI] MSPowerUser).

**Temuan 4 — Ada pemisahan tugas yang konsisten antara operator.**
Aplikasi berorientasi *rute* (Citymapper, Moovit, HERE WeGo, Google Maps)
menempatkan peta di atas. Aplikasi berorientasi *tiket* (DB Navigator, SNCF
Connect) menempatkan daftar di atas dan peta sebagaiPelengkap.

### 2.3 Kapan peta adalah layar utama, kapan daftar

| Situasi | Layar utama | Alas |
| --- | --- | --- |
| Rider sudah tahu mau ke mana, hanya butuh rute tercepat | **Peta** | Peta menjawab "pindah di mana" dan "sudah sampai mana" lebih cepat daripada daftar ([DOK] HIG Maps: peta memakai antarmuka yang familier dengan zoom, pan, dan rotasi) |
| Rider belum tahu mau ke mana | **Daftar/pencarian** | Contoh SNCF Connect: pencarian dulu ([OPINI]) |
| Rider membeli tiket | **Daftar** | DB Navigator, SNCF Connect |
| Rider sedang_RUNNING_ di perjalanan | **Peta** dengan info langsung | Citymapper "En Route", Moovit "En Route" ([DOK] Moovit press release) |

Daily Route adalah produk rute, jadi **peta layak menjadi layar utama**.

---

## 3. Pola "peta pertama dengan search melayang"

### 3.1 Aturan ukuran yang terverifikasi

| Parameter | Nilai | Sumber |
| --- | --- | --- |
| Radius sudut atas bottom sheet | **28 dp** | [DOK] [Material 3 — Bottom sheets, Overview](https://m3.material.io/components/bottom-sheets/overview) |
| Radius modal side sheet | **16 dp** | [DOK] [Material 3 — Side sheets, Overview](https://m3.material.io/components/side-sheets/overview) |
| Lebar maksimum bottom sheet | **640 dp** | [DOK] [Material 3 — Bottom sheets, Overview](https://m3.material.io/components/bottom-sheets/overview) |
| Drag handle | opsional, dengan target sentuh **48 dp** | [DOK] [Material 3 — Bottom sheets, Overview](https://m3.material.io/components/bottom-sheets/overview) |
| Batas atas modal bottom sheet | **50 % tinggi layar** pada posisi awal | [DOK] [Material 3 — Bottom sheets, Guidelines](https://m3.material.io/components/bottom-sheets/guidelines) |
| Breakpoint Material | compact < 600 dp, medium 600–839 dp, expanded ≥ 840 dp | [DOK] [Material 3 — Bottom sheets, Guidelines](https://m3.material.io/components/bottom-sheets/guidelines) |
| Detent Apple | `medium` ≈ setengah tinggi penuh; `large` = tinggi penuh; custom `fraction`/`height` | [DOK] [HIG Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [DOK] [WWDC21 — Customize and resize sheets](https://developer.apple.com/videos/play/wwdc2021/10063) |
| Padding kontrol kustom di atas peta (Apple) | 7 pt sisi, 10 pt atas–bawah | [DOK] [HIG Maps](https://developer.apple.com/design/human-interface-guidelines/maps) |
| Jarak aman bawah | `env(safe-area-inset-bottom)`; abaikan gesture area bila peek < inset | [DOK] [BottomSheetBehavior — setGestureInsetBottomIgnored](https://developer.android.com/reference/com/google/android/material/bottomsheet/BottomSheetBehavior) |
| Target sentuh | **44 pt** (Apple), **48 dp** (Android), WCAG 2.2 AA minimal 24 px | [OPINI] [WeAccess](https://www.weaccess.ai/blogs/mobile-touch-target-size), [OPINI] [TestParty](https://testparty.ai/blog/wcag-target-size-guide) |

### 3.2 Pola "peta dulu" vs pola "cari dulu"

| | Peta dulu (map-first) | Cari dulu (search-first) |
| --- | --- | --- |
| Pemakai | Citymapper, Moovit, HERE WeGo, Google Maps, Apple Maps, TfL Go, MyTransport.SG, Transit, KakaoMetro | SNCF Connect, sebagian DB Navigator |
| Cognition | "di mana saya sekarang" → "di mana tujuan" → "mana rute" | "apa tujuan" → "mana rute" → "di mana saya sekarang" |
| _Kapan dipakai_ | Rider sudah tahu tujuan | Rider sedang menjelajah atau belum yakin |
| Risiko | Peta kosong sebelum ada query → terasa kosong | Peta tidak terlihat sebelum ada hasil → terasa seperti formulir |
| Biaya | — | Satu langkah lebih banyak sebelum peta terlihat |

**[OPINI]** Rekap dari NN/G: bottom sheet yang nonmodal "sangat sesuai
untuk menyajikan informasi atau opsi secara paralel dengan informasi utama di
layar" ([NN/G — Bottom Sheets](https://www.nngroup.com/articles/bottom-sheet)).
Artinya **peta dan daftar memang diminta berdampingan**, dan pola "cari dulu"
yang menyingkirkan peta sepenuhnya bertentangan denganevidence yang ada.

**Rekomendasi Daily Route**: map-first sebagai default. Search-first hanya
sebagai **jalur kedua** (mis. ketika pengguna menekan "Tanya" atau ketika
tujuan belum diketahui). Ini justru konsep C.

### 3.3 Risiko pola "peta pertama dengan panel mengambang"

1. **Panel menutup peta.** Pada 1440×900, panel 400 px × 58 % menutup 16 %
   area peta di kiri bawah. Mitigasi: gambar rute agar tidak jatuh di bawah
   panel (dilakukan di prototipe) dan beri `fitBounds` dengan padding.
2. **Scroll chaining.** Gulir di panel dapat menggulir peta di belakang.
   Mitigasi: `overscroll-behavior: contain` pada panel.
3. **Dua permukaan mengambang bertabrakan.** Di narrow (< 400 px) kartu
   pencarian dan panel hasil akan bertumpuk. Mitigasi: pada compact, panel
   hasil menjadi sheet (konsep B) atau dikunci ke bawah (konsep A).
4. **Tidak ada tempat untuk chrome global.** Karena tidak ada app bar, pengaturan
   harus pindah ke kontrol peta (yang memang sudah menjadi tempatnya).

---

## 4. App bar atas: kapan diperlukan

### 4.1 Bukti bahwa app bar jarang dipakai aplikasi transit

- **HIG**: navigation bar "translucent, may have a background tint, and can
  be configured to hide when appropriate" ([DOK] [HIG Navigation bars](https://codershigh.github.io/guidelines/ios/human-interface-guidelines/ui-bars/navigation-bars/index.html)).
  HIG juga: "In general, a navigation bar should contain no more than the
  view's current title, a back button, and one control that manages the
  view's contents."
- **Material 3** tetap menyediakan app bar, tetapi hanya dalam empat varian
  (search, small, medium flexible, large flexible), dan menandai medium dan
  large sebagai "no longer recommended" ([DOK] [M3 App bars, Overview](https://m3.material.io/components/app-bars/overview)).
- **Material 3** pada app bar: "It can collapse into a small app bar on
  scroll. The app bar can remain on a page at all times, or can hide and
  reappear when scrolling" ([DOK] [M3 App bars, Guidelines](https://m3.material.io/components/app-bars/guidelines)).
- **Apple**: tab bar adalah cara navigasi utama; "Make sure the tab bar is
  visible when people navigate to different sections of your app" ([DOK]
  [HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)).

### 4.2 Isi minimal app bar yang pantas

Kalau sebuah layar memang butuh app bar (mis. halaman "Tanya" yang berdiri
sendiri), isinya cukup: **judul layar, satu kontrol, dan tidak lebih**. Tidak
ada logo + deskripsi + badge + tombol tema sekaligus.

### 4.3 Di mana status fitur dan tema

- **Status fitur yang belum aktif** bukan tugas navigasi. Ia harus berada di
  tempat yang memakai fitur itu: di panel "Tanya" sebagai catatan 12 px, atau
  sebagai titik status di kontrol peta dengan tooltip yang menjelaskan
  ("Asisten belum aktif: belum ada kunci model"). Ini persis yang sudah
 persis yang sudah dilakukan pada sumber aplikasi sekarang: badge status dan tombol
  tema pindah ke kanan atas, di atas peta.
- **Tema** adalah kontrol tampilan, bukan navigasi. Tempat yang tepat:
  kontrol peta (ikon bulan/matahari) atau pengaturan. Apple's own Maps
  memberi contoh padding yang perlu disisakan untuk logo dan legal link saat
  UI kustom bergerak ([DOK] HIG Maps).

### 4.4 Hide on scroll — apakah ada bukti kuat?

**Ya, tapi hanya untuk app bar, bukan untuk peta.**

- Material 3 menyediakan `enterAlways`, `exitUntilCollapsed`, dan `pinned`
  sebagai perilaku gulir app bar ([DOK] [Android — App bars](https://developer.android.com/develop/ui/compose/components/app-bars)).
- Material 3 M3 sudah menghapus drop shadow app bar dan menggantinya dengan
  isian warna saat menggulir ([DOK] M3 App bars, Overview).
- Apple's HIG menyatakan tab bar "remains pinned at the top of the view while
  people scroll the content within the primary and secondary panes of the
  split view" — jadi pada split view, chrome **tidak** ikut hilang.

**Kesimpulan untuk Daily Route**: kalau nanti ada app bar, perilakunya
`exitUntilCollapsed` — menyusut jadi app bar kecil, bukan hilang total.
Mempertahankan posisi title mengurangi disorientasi. **Untuk konsep A, B,
dan C tidak ada app bar sama sekali, jadi pertanyaan hide-on-scroll tidak
muncul.** Yang perlu digulirkan adalah isi panel, bukan chrome-nya.

---

## 5. Panel kiri vs peta

### 5.1 Pedoman yang terverifikasi

- **Apple HIG, Split views**: "By default, a split view devotes a third of
  the screen width to the primary pane and two-thirds to the secondary pane,
  but you can also specify a half-and-half layout." Dan: "Display a single
  title above a split view" ([DOK] [HIG Split views](https://developer.apple.com/design/human-interface-guidelines/split-views)).
  IniGuideline untuk *halaman* dengan navigasi hierarkis, bukan untuk alat
  peta.
- **Material 3, Side sheets**: side sheet dipakai "to provide optional
  content and actions without interrupting the main content"; varian standar
  "display content without blocking access to the screen's primary content"
  dan sering dipakai di medium dan expanded width ([DOK] [M3 Side sheets](https://m3.material.io/components/side-sheets/overview)).
  Ini persis padanan sisi dari "panel kiri" yang tidak memotong peta.
- **NN/G, visual hierarchy**: "the screen is split in half between the map
  and input form (bottom half of screen), which enforces the thought that
  these components are equally important to the user" — contoh Uber
  ([DOK]-ish [NN/G 5 Principles of Visual Design](https://www.nngroup.com/articles/principles-visual-design)).
  Pelajaran: pemisahan 50/50 kesetaraan yang **sengaja**, bukan 30/70 yang
  membuat peta terasa como Phillips.

### 5.2 Kapan split view (desktop) lebih baik daripada peta penuh + panel mengambang

Split view menang kalau:
1. **Isi panel adalah navigasi hierarkis** (daftar folder, tree, filter
   multi-level) — Apple menyebut split view sebagai cara "display a sidebar
   for navigation".
2. **Dua konten punya bobot yang setara** dan pembacaan panel memerlukan
  luas besar yang konstan (mis. tabel jadwal penuh).
3. **Perangkat adalah desktop/tablet** dan ada pointer yang presisi.

Peta penuh + panel mengambang menang kalau:
1. **Peta adalah produk** (seperti Daily Route).
2. **Panel hanya perlu dibaca sekilas** lalu kembali ke peta.
3. **Pemakai satu tangan** di ponsel, atau memakai trackpad di laptop.

**Daily Route: peta menang.** Rider tidak menavigasi hierarki; ia melihat satu
jalur di atas kota.

### 5.3 Risiko "map-first with floating panels"

| Risiko | Gejala | Mitigasi |
| --- | --- | --- |
| Panel menutupi peta | Titik penting hilang di bawah panel | Gambar rute di luar area panel; `fitBounds` dengan padding; panel bisa diciutkan |
| Scroll chaining | Menggulir panel ikut menggulir peta | `overscroll-behavior: contain` |
| Panel melayang menutupi kontrol peta | Tombol zoom/lapis tertutup | Kontrol peta di kanan atas; panel di kiri bawah (konsep A) |
| Legenda yang jadi strip penuh | Lebar penuh di bawah peta menutupi peta | Legenda pindah ke dalam panel hasil (konsep A) atau jadi pil melayang (saat ini di sumber aplikasi) |

---

## 6. Pattern mobile

### 6.1 Bottom sheet vs panel penuh

| | Bottom sheet | Panel penuh |
| --- | --- | --- |
| Kapan | Mobile, ketika peta adalah konteks | Mobile, ketika daftar adalah isi (DB Navigator) |
| Bukti | [DOK] Material 3: sheet dipakai di compact dan medium; varian standar tidak memblokir konten utama. [DOK] HIG Sheets: detent `medium` untuk progressive disclosure | [OPINI] DB Navigator memakai daftar; [OPINI] SNCF Connect memakai halaman hasil |
| Risiko | Sheet expanded terlihat seperti halaman biasa sehingga pengguna menekan Backexpectasi navigasi ([NN/G](https://www.nngroup.com/articles/bottom-sheet)) | Peta hilang; runner harus menggulir panjang |

**Rekomendasi Daily Route mobile**: **hybrid** — peta tetap penuh, hasil
naik dari bawah sebagai sheet. Ini persis pola Google Maps, dan cocok dengan
brief: sheet **peek 30 %**, **half 55 %**, **full 92 %**.

### 6.2 Notch, safe area, keyboard, gestur

- **Safe area**: atas 44–59 pt pada iPhone modern, bawah 34 pt untuk home
  indicator ([DOK] HIG — safe area). Praktisnya: `padding-bottom:
  env(safe-area-inset-bottom)` pada sheet.
- **Gesture inset**: `BottomSheetBehavior` menyediakan
  `setGestureInsetBottomIgnored` untuk menghindari konflik gestur saat peek
  lebih kecil dari inset gestur ([DOK] Android API).
- **Keyboard**: keyboard menutupi sheet; sheet harus naik di atas keyboard
  (visualViewport / `interactive-widget=resizes-content`). Bila input
  berada di dalam sheet, sheet harus naik minimal setinggi keyboard + 12 px.
- **Gestur**: pegangan (grabber) lebar 36 px, tebal 4 px, area sentuh 48 dp
  ([DOK] M3 bottom sheets) — towering target 48 dp meski visualnya kecil.
- **Scroll**: `overscroll-behavior: contain` di dalam sheet, dan
  nested-scroll coordination ketika sheet sudah full.

---

## 7. Tanda "AI slop" pada layout

Diambil dari [Developers Digest — AI Design Slop: 16 Patterns](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it),
[Impeccable — Slop](https://impeccable.style/slop), dan
[925Studios — AI Slop Web Design](https://www.925studios.co/blog/ai-slop-web-design-guide)
(ketiganya **[OPINI]**).

| Tanda | Bentuk di Daily Route | Pengganti yang dipakai di aplikasi transit nyata |
| --- | --- | --- |
| Sidebar + kartu di tengah | Panel kiri 440 px berisi form, peta di kanan, kedua-duanya terbagi rata | Peta penuh; panel mengambang 400 px di kiri bawah; kartu pencarian melayang |
| App bar dengan logo dan deskripsi | Logo + "Daily Route" + kalimat "Rute Transjakarta, MRT, LRT, dan KRL Jabodetabek" | Logo sebagai satu token kecil di dalam kartu pencarian, atau tidak ada sama sekali |
| Badge status di tempat yang tidak terkait | Badge "Asisten nonaktif" di kanan atas app bar | Titik status di kontrol peta dengan tooltip; catatan di panel "Tanya" |
| Tiga kartu identik | Grid tiga kartu satu gaya | Panel hasil yang isinya berbeda-beda: ringkasan, alternatif, rincian |
| Padding berlebihan | `px-4 py-4` di semua sisi + kartu di dalam kartu | Satu permukaan, radius 14 px, padding 12–14 px, pembatas 1 px |
| Legenda sebagai strip penuh | Strip tipis di bawah peta | Legenda di dalam panel hasil (konsep A) atau pil melayang |
| Grid dekoratif | Tidak ada di aplikasi, tapi häufig dipakai AI | Peta adalah "grid" itu sendiri; tidak perlu latar dekoratif |
| Teks kecil tanpa alasan | Deskripsi app bar 12 px | 12 px hanya untuk metadata; nama tempat 15 px |
| Font default sistem tanpa identitas | Plus Jakarta Sans sudah dipakai | Pertahankan; ini hal yang harus dijaga |

Kaidah dari [Developers Digest](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it):
"**They use one strong layout primitive and repeat it.** Not seven feature
cards with seven different icon treatments. Not three stat banners and four
step sequences and a sidebar with emojis."

Untuk Daily Route, primitifnya adalah **satu permukaan mengambang** yang
berisi: pencarian → ringkasan → alternatif → rincian. Diulang, bukan
ditambah-tambah dengan kartu-kartu baru.

---

## 8. Ukuran yang harus dijaga

| Ukuran | Nilai | Alasan |
| --- | --- | --- |
| Tinggi app bar | **0 px (tidak ada)** | Peta adalah layar utama; app bar mengambil ruang yang paling berharga |
| Lebar panel hasil (desktop) | **400 px** (A) / **420 px** side sheet (B) / **480 px** kolom form (C) | 400 px cukup untuk nama rute terpanjang ("Ragunan - Balai Kota VIA Semanggi") tanpa-wrap pada 15 px |
| Lebar maksimum isi teks | **640 px** (± 70 ch) | `DESIGN.md` menetapkan 15 px untuk nama; pada 15 px, 640 px ≈ 80 karakter |
| Radius kartu | **14 px** | Sudah jadi token `--radius-card` |
| Radius sudut atas sheet | **16 px** | Deviasi terkecil dari skala radius yang ada dan konsisten dengan M3 side sheet 16 dp |
| Radius kontrol peta | **10 px** | Token `radius-md` |
| Radius target sentuh | **24 px** | Standar M3 untuk target sentuh |
| Target sentuh | **44 px** (iOS) / **48 dp** (Android) | [OPINI] WeAccess, TestParty |
| Sheet peek / half / full | **30 % / 55 % / 92 %** | Di bawah batas 50 % M3 untuk modal sheet; 92 % memberi ruang baca leg |
| Breakpoint aplikasi | **900 px** | Di atas `expanded` M3 (840 dp) dan jauh di atas `compact` (600 dp) |
| Tinggi region layar penuh | **dvh** | Sudah jadi aturan `AGENTS.md`; `vh` mengabaikan bilah browser di ponsel |
| Margin luar mengambang | **20 px** desktop, **12 px** mobile | 20 px memberi "napas" di desktop; 12 px="% nilai" yang Sergei |
| Batas durasi di mobile | **28 px** (bukan 40 px) | 40 px eats 4,7 % tinggi layar ponsel |
| tinggi app bar lama | 60 px (brief) / **64 px** (estimasi dari token) | [BELUM TERVERIFIKASI] belum diukur di peramban |

---

## 9. Rekomendasi: tiga konsep layout

Angka lengkap ada di [`ux-layout-patterns.spec.json`](ux-layout-patterns.spec.json).
Prototipe: [`prototypes/layout-a-map-first.html`](prototypes/layout-a-map-first.html),
[`prototypes/layout-b-sheet.html`](prototypes/layout-b-sheet.html),
[`prototypes/layout-c-search-first.html`](prototypes/layout-c-search-first.html).

### Konsep A — Peta pertama, panel mengambang *(rekomendasi utama)*

**Bentuk desktop (1440×900)**

```
┌───────────────────────────────────────────────────────────────┐
│ ┌──────────────┐                                              │
│ │ kartu cari   │                              [kontrol peta]  │
│ │ 420 px       │                                              │
│ └──────────────┘                                              │
│                                                               │
│ ┌────────────────────┐                        ┌─────────────┐ │
│ │ panel hasil        │        PETA            │ legenda     │ │
│ │ 400 px             │        PENUH           │ (pil)       │ │
│ │ maks 58 % tinggi  │                        └─────────────┘ │
│ └────────────────────┘                                        │
└───────────────────────────────────────────────────────────────┘
```

| Parameter | Nilai |
| --- | --- |
| Tinggi app bar | **null** (tidak ada) |
| Lebar panel hasil | **400 px**, inset **20 px** dari kiri dan bawah |
| Lebar kartu pencarian | **420 px**, inset **20 px** dari kiri atas |
| Tinggi maksimum panel | **58 %** tinggi jendela |
| Radius | **14 px** |
| Kontrol peta | kanan atas, tombol **40 px**, radius 10 px, inset 20 px |
| Legenda | **di dalam panel hasil**, bukan strip di bawah peta |

**Bentuk mobile (390×844)**

| Parameter | Nilai |
| --- | --- |
| Tinggi app bar | **null** |
| Kartu pencarian | melayang, inset **12 px**, lebar penuh (390 − 24 = 366 px), radius 12 px |
| Panel hasil | mengambang di bawah, inset **12 px**, **maks 46 %** tinggi layar (≈ 388 px), radius 12 px |
| Sheet yang bisa ditarik | **tidak ada** (keputusan sadar) |
| Kontrol peta | kanan atas, tombol **36 px**, baris |
| Legenda | disembunyikan di compact; warna mode sudah tertulis di daftar leg |

**Kenapa lebih baik daripada pola lama**

1. Peta mendapat **100 %** lebar dan tinggi, bukan 60 % × 42 %.
2. Tidak ada app bar yang setiap layar harus membayar 60–64 px.
3. Satu permukaan (kartu pencarian + panel hasil) alih-alih tab Rute/Tanya di
   dalam panel yang membuat peta dan daftar terasa dua aplikasi.
4. Status "Asisten nonaktif" pindah ke tempat yang memakainya, bukan ke
   chrome atas.

**Risiko**

- Panel menutup peta di kiri bawah → rute harus digambar di luar area itu.
- Dua permukaan mengambang → pada < 400 px, panel hasil sebaiknya menjadi
  sheet (yaitu Konsep B).
- Tidak ada tempat global untuk pengaturan → tempatkan di kontrol peta.

### Konsep B — Peta penuh dan bottom sheet *(rekomendasi untuk mobile)*

**Bentuk desktop (1440×900)**: peta mengisi seluruh jendela; satu **side
sheet** 420 px melayang di kiri dengan inset 16 px, radius 16 px, tinggi
penuh. Isinya: pencarian → ringkasan → alternatif → rincian.

**Bentuk mobile (390×844)**: peta penuh; satu bottom sheet dengan handle.

| Parameter | Nilai |
| --- | --- |
| Tinggi app bar | **null** |
| Sheet peek | **30 %** tinggi layar (≈ 253 px) |
| Sheet half | **55 %** (≈ 464 px) |
| Sheet full | **92 %** (≈ 776 px) |
| Radius sudut atas sheet | **16 px** |
| Handle | lebar 36 px, tebal 4 px, area sentuh 48 dp |
| Modal? | **tidak** — peta tetap hidup, tidak ada scrim |
| Side sheet (desktop) | lebar **420 px**, inset 16 px, radius 16 px |

**Kenapa lebih baik daripada pola lama**

1. Satu permukaan, bukan tiga: tidak ada app bar, tidak ada tab, tidak ada
   panel kiri.
2. Progressive disclosure yang terverifikasi: peek untuk jawaban, half untuk
   alternatif, full untuk rincian leg.
3. Peta tetap interaktif di belakang sheet — persis pola Google Maps yang
   [@doveletter](https://doveletter.dev/articles/flexible-bottomsheet-google-maps)
   gambarkan sebagai "popolerisasi" bottom sheet.
4. Di desktop, side sheet 420 px memenuhi anjuran M3: side sheet standar
   dipakai di medium dan expanded width.

**Risiko**

- Detent adalah perangkat sentuh; di desktop harus ada padanan (side sheet).
- Scroll chaining antara isi sheet dan peta.
- Kalau pencarian berada di dalam sheet, pengguna harus membuka sheet dulu
  untuk mencari — ini yang membuat Konsep A lebih baik untuk layar pertama.

### Konsep C — Cari dulu, peta setelah hasil *(rekomendasi untuk "Tanya")*

**Bentuk desktop (1440×900), keadaan 1 — pencarian**

- Tidak ada peta. Kolom form **480 px** di kiri, padding kiri 24 px, offset
  atas 68 px.
- Judul "Ke mana hari ini?" (28 px) + satu kalimat (13 px).
- Dua field (Dari/Ke), tombol "Tampilkan rute" dan "Tanya".
- Kolom kanan: **diagram jaringan**, bukan peta — lima garis operator dengan
  warna mode, titik tumpuk, dan legenda. Ini yang membedakan dari formulir
  generik.
- "Perjalanan terakhir": tiga baris.

**Bentuk desktop, keadaan 2 — hasil**: peta penuh; **dock ringkas** setinggi
**104 px** dengan inset 16 px dan radius 14 px; isi dock: durasi (28 px),
meta (14,6 km · 3 kali pindah · Rp7.000), **ribbon leg** (badge 6B/2A/4D/S
dengan durasi), dan tombol "Rincian".

**Bentuk mobile (390×844)**: keadaan 1 = form penuh dengan padding 16 px;
keadaan 2 = peta + **pil** di atas (12 px inset, radius 12 px, tombol "Ubah")
+ **kartu ringkas** 190 px di bawah (inset 12 px, radius 12 px).

**Kenapa lebih baik daripada pola lama**

1. Memperbaiki masalah "peta kosong": pengguna yang belum tahu mau ke mana
   tidak melihat peta yang kosong.
2. Menghapus app bar sepenuhnya: layar pencarian punya hierarki sendiri.
3. Diagram jaringan di kanan memberi alasan untuk melihat layar ini — dan
   menggunakan warna mode sebagai bahasa visual, bukan warna dekoratif.

**Risiko**

- Satu langkah tambahan sebelum peta terlihat → terasa lambat.
- Butuh dua keadaan yang harus dijaga agar konsisten.

### Rekomendasi akhir

| Situasi | Konsep |
| --- | --- |
| **Halaman utama (default)** | **A** di desktop, **B** di mobile (sheet 30/55/92) |
| **Layar "Tanya"** | **C** keadaan 1 (pencarian) → **B** keadaan 2 |
| Mulai dari mana | Implementasi A sudah ada di sumber aplikasi; B adalah peningkatan mobile |

---

## 10. Lima alasan pola lama dianggap generik

1. **App bar yang isinya tidak bekerja.** Logo, judul, deskripsi operator,
   badge status, dan tombol tema adalah lima hal berbeda dalam 60 px yang
   tidak memindahkan pengguna ke mana pun. [DOK] HIG: navigation bar idealnya
   berisi judul, tombol kembali, dan satu kontrol saja.
2. **Panel kiri 440 px membuat peta terasa lampiran.** Peta hanya mendapat
   1000 px dari 1440 px dan 58 % dari tinggi layar di ponsel. Untuk produk
   yang jualan "mana rute", ini menangkap pembagian layar yang salah.
3. **Legenda sebagai strip tipis penuh di bawah peta** — elemen dekoratif
   yang menutupi peta dan tidak bisa diklik. Legenda seharusnya bagian dari
   panel yang bisa dibaca bersama daftar leg.
4. **Tab "Rute"/"Tanya" di dalam panel** membuat satu panel serves dua
   aplikasi yang tidak berbagi apa pun; peta lalu menjadi latar yang terpotong.
5. **Status fitur yang belum aktif dipromosikan di chrome atas.** "Asisten
   nonaktif" adalah informasi operasional, bukan navigasi; menaruhnya di
   tempat paling prestisius di layar (kanan atas app bar) justru memberi
   بموعد bahwa fitur inti belum jadi — dan menambah satu elemen lagi ke
   bar yang sebenarnya bisa dihapus.

---

## 11. Status implementasi di repositori

Per 21 Oktober 2026, `apps/web/src/routes/__root.tsx` dan
`apps/web/src/routes/index.tsx` **sudah diubah** sehingga:

- shell tidak lagi memakai `<header>`; badge status asisten dan tombol tema
  pindah ke kontrol melayang di kanan atas di atas peta;
- halaman perencana memakai `grid-cols-1 grid-rows-1` — tidak ada kolom
  lebar tetap; peta mengisi seluruh jendela;
- kolom mengambang desktop `lg:w-[400px]` (sesuai Konsep A);
- panel hasil di mobile dibatasi `max-h-[55%]` dan menempel di bawah;
- legenda menjadi pil melayang di tengah bawah, bukan strip penuh.

Artinya **bagian Konsep A sudah ada di kode**. Yang belum ada: sheet tiga
detent Konsep B (mobile), layar pencarian Konsep C, dan Specification check
yang mengunci angka-angkanya. `research/tools/ux-visual/layout_check.py`
memeriksa hal itu.

---

## 12. Yang tidak bisa diverifikasi

1. **Tinggi app bar lama 60 px** — angka dari brief; nilai yang dihitung dari
   token adalah sekitar 64 px. Belum diukur di peramban.
2. **Halaman HIG "Navigation bars"** — `developer.apple.com/design/human-interface-guidelines/navigation-bars` mengembalikan 404 saat riset; kutipan diambil dari mirror `codershigh.github.io`.
3. **Material 3 "top app bar"** — `m3.material.io/components/top-app-bar/overview` 404; halaman yang benar adalah `/components/app-bars/overview`.
4. **Material 3 "list-detail"** — `m3.material.io/foundations/adaptive-design/layouts/list-detail` 404 saat riset.
5. **Transit mobile trip planner** — `help.transitapp.com/article/532-trip-planner-for-mobile` 404; hanya versi desktop yang bisa dibaca.
6. **WCAG 2.5.8** — dokumen W3C resmi tidak dibaca langsung; angka 24 px diambil dari beberapa ringkasan.
7. **Lebar panel dan tinggi sheet yang dipakai aplikasi secara konkret** — tidak satu pun aplikasi publishing angka ini; angka dalam laporan ini adalah turunan dari Material 3, Apple HIG, dan pengukuran pada prototipe, bukan angka yang diambil dari aplikasi lain.
8. **Pengguna aktual** — tidak ada uji usability; semua ini analisis pola, bukan bukti empiris tentang preferensi pengguna Daily Route.
9. **Perilaku geser sheet** — hanya disimulasikan lewat `data-detent`; belum ada implementasi fisika geser.
