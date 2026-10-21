# Galeri Referensi Visual — Daily Route

> **Status:** 21 Oktober 2026.
> Pasangan dari `research/ux-visual-language.md`. Setiap entri: apa itu, apa
> yang diambil darinya, dan satu penilaian satu baris.
>
> **Legenda status** — dipakai di setiap entri:
> - ✅ **Bisa dibuka** — saya buka dan membaca / melihat sendiri isinya.
> - 🟡 **Bisa dibuka, sebagian** — halamannya terbuka, tapi sebagian kontennya
>   (gambar, PDF, bagian yang lebih panjang) tidak bisa saya baca atau tidak saya lihat.
> - ❌ **Tidak bisa dibuka** — hanya cuplikan/ringkasan yang tersedia; isi
>   sebenarnya tidak saya verifikasi.

---

## A. Peta (map UI) — 6 tautan

### A1. Mapbox Navigation SDK — Route line ✅
<https://docs.mapbox.com/android/navigation/v2/guides/ui-components/route-line>
**Apa ini:** dokumentasi resmi cara Mapbox menggambar garis rute.
**Ambil apa:** model **tiga lapis** — casing terlebar di bawah, garis utama di
tengah, lapisan lalu lintas di atas. Ini dasar aturan "halo → casing → garis"
di dokumen bahasa visual.
**Penilaian:** satu-satunya dokumentasi resmi yang menjelaskan *kenapa* rute
butuh lebih dari satu lapisan; detail lain (sumber daya warna, `softGradient`)
tidak relevan untuk produk tanpa lalu lintas.
*Semua yang lain di grup ini adalah "referensi rasa", bukan referensi teknis.*

### A2. Mapbox Style Spec — properti line ✅
<https://docs.mapbox.com/style-spec/reference/layers>
**Apa ini:** daftar lengkap properti layer (`line-width`, `line-gap-width`,
`line-border-width`, `line-cap`, `line-join`, `line-dasharray`).
**Ambil apa:** nama-nama properti yang benar untuk dieksploitasi —
`line-border-width` untuk casing tanpa layer terpisah, `line-dasharray` untuk
jalan kaki.
**Penilaian:** acuan teknis; bukan contoh visual.

### A3. Mapbox GL JS — urutan layer ✅
<https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers>
**Apa ini:** cara menumpuk layer di atas style yang ada.
**Ambil apa:** urutan layer di `styles.css`/MapLibre harus eksplisit: halo →
casing → garis → titik → label. Menambahkan layer selalu menaruh di atas
semua, jadi tanpa urutan eksplisit, label halte akan tertutup garis.
**Penilaian:** wajib dibaca sekali sebelum menyentuh lapisan peta.

### A4. Marcus Fleckner — "How To Design Interchanges" 🟡
<https://medium.com/map-quest/how-to-design-interchanges-b9721af136a4>
**Apa ini:** artikel kartografer tentang simbol pertukaran pada peta transit.
**Ambil apa:** Justifikasi simbol berbeda untuk halte biasa, interchange, dan
simpul; bentuk cincin untuk transfer.
**Penilaian:** Mechanical Turk (Medium member-only) — saya hanya melihat
cuplikan dan gambar visualisasinya; artikel penuhnya berbayar. Tetap referral
pola yang tepat.

### A5. Geohub — "Understanding Transit Maps" ✅
<https://geohubkenya.wordpress.com/2025/06/19/understanding-transit-maps-key-features-and-design-principles>
**Apa ini:** ringkasan prinsip peta transit (Beck, Wu et al. 2020).
**Ambil apa:** *line styles* (lebar + pola) membedakan jenis layanan;
*station styles* berbeda ukuran/bentuk menurut importance.
**Penilaian:** sumber sekunder yang rapi; bagus untuk mengutip alasan, bukan
untuk meniru gaya.

### A6. MTC Bay Area — Regional Mapping & Wayfinding 🟡
<https://mtc.ca.gov/operations/transit-regional-network-management/regional-mapping-wayfinding>
dan <https://mtc.ca.gov/sites/default/files/documents/2026-02/TransitStopSignageDesignGuide260217.pdf>
**Apa ini:** standar wayfinding dan panduan penandaan halte dari otoritas
transit Amerika Serikat.
**Ambil apa:** argumen bahwa wayfinding transit **wajib konsisten** antar
moda — dasar keputusan "warna mode = taksonomi sistem" dan bukan warna
armada.
**Penilaian:** standar resmi, bukan desain; PDF-nya saya belum membaca
halaman demi halaman.

### A7. transitmap.net — simbol di Illustrator ✅
<https://transitmap.net/symbols>
**Apa ini:** tutorial memakai fitur Symbols untuk membuat simbol halte &
interchange yang konsisten.
**Ambil apa:** tidak dipakai sebagai alat, tapi sebagai bukti bahwa
simbol pertukaran adalah bahasa yang sudah mapan — bukanCRIBE karangan.
**Penilaian:** kecil, teknis, jujur; bagus untuk argumen "konvensi sudah ada".

### A8. Organic Maps ✅
<https://organicmaps.app/>
**Apa ini:** aplikasi peta open-source dengan mode gelap yang benar-benar
dirancang ulang (bukan sekadar dibalik).
**Ambil apa:** bukti bahwa mode gelap yang "dibalik" menghasilkan teks yang
besar dan peta yang menyatu; mode gelap harus punya palet sendiri.
**Penilaian:** contoh mode gelap yang tenang — kebalikan dari
"neon on dark" yang diwarnai Impeccable.

---

## B. Daftar perjalanan (journey list) — 5 tautan

### B1. Citymapper (web app) ✅
<https://citymapper.com/>
**Apa ini:** perencana perjalanan di web; saya buka sendiri dan melihat
panel "Get Me Somewhere": bidang **Start** / **End** dengan tombol tukar di
tengahnya, sekumpulan pilihan waktu **Now / Arrive / Leave** dalam bentuk radio, dan
tombol **Go**.
**Ambil apa:**
- Time selector memakai **radio, bukan dropdown** — cepat, terlihat, dan
  bisa ditebak.
- Panel koordinator memakai **latar slate solid (#417193)** dengan input
  putih di atasnya — kontras tinggi tanpa bayangan.
- Huruf "Start"/"End" berwarna hijau aksen di dalam input, bukan placeholder
 Abu-abu.
**Penilaian:** satu-satunya produk sungguhan yang bisa saya lihat langsung
selama riset ini, dan tuannya paling berguna. Catatan: warna hijaunya
(#37ab2e, hasil sampling piksel) **bukan** warna Daily Route; jangan disalin,
pelajari strukturnya saja.

### B2. Citymapper — "Our Global Walk Routing" ✅
<https://content.citymapper.com/news/2521/our-global-walk-routing>
**Apa ini:** penjelasan fitur Citymapper.
**Ambil apa:** kutipan kunci — *"our unique design and user interface, where
map and instructions are linked, to enable an intuitive exploration of the
route, just by scrolling through the single steps"*. Ini sumber untuk aturan
sinkronisasi daftar ↔ peta di bagian 7.4.
**Penilaian:** sumber vendor, tapi deskripsi mekanismenya spesifik dan bisa
diuji; bukan klaim kosong.

### B3. Dribbble — "Toronto public transit app." ✅ (gambar saya lihat)
<https://dribbble.com/shots/9381920-Toronto-public-transit-app>
**Apa ini:** dua layar: peta **skematis** (bukan geografis) dengan garis
merah/kuning/hijau dan penanda halte berupa **lingkaran bertepi putih**, dan
sebuah sheet "Transit Information".
**Ambil apa:**
- Penanda halte = **titik putih berlubang** di atas garis berwarna. Konvensi
  yang membuat garis tetap terbaca sebagai satu lintasan.
- Penanda kendaraan = **pin merah bernomor** ("7") — nomor kendaraan, bukan
  nama. Pola yang bisa kita pakai untuk "bus ke-2".
- Gangguan ditulis **dalam satu kalimat** dengan chip kode jalur berwarna
  ("**504** is delayed at Broadview Station"), bukan banner lebar.
**Penilaian:** dari semua shot Dribbble yang saya lihat, ini paling dekat
dengan apa yang Daily Route butuhkan — daftar Informationen sebagai lapisan
di atas peta, bukan kartu terpisah.
*Catatan*: latar merah muda di luar phones adalah latar papan Dribbble, bukan
bagian dari desain aplikasi.

### B4. Dribbble — "Smart Transit App – Route Planning UI/UX" ✅ (gambar saya lihat)
<https://dribbble.com/shots/26934690-Smart-Transit-App-Route-Planning-UI-UX>
**Apa ini:** tiga phones monokrom (hitam/putih) menampilkan beranda, panel
pengaturan, dan panel obrolan.
**Ambil apa:** tunjukkan bahwa **monokrom total + satu warna aksen** bisa
membuat antarmuka terlihat mahal; juga pola tab "Dialogue | Explore" dengan
konten yang berbeda — persis dilemma "Route | Tanya" di Daily Route.
**Penilaian:** restraint-nya bagus, tapi layoutnya adalah template: kartu
"METROHUB CENTRAL" berisi foto kereta dan chip "Central Line / 8-10min" yang
kita **jangan** tiru (kode jalur seharusnya mono, bukan chip besar).

### B5. Dribbble — "Travel Assistant — Explore & Ask with Ease" ✅ (gambar saya lihat)
<https://dribbble.com/shots/26984283-Travel-Assistant-Explore-Ask-with-Ease>
**Apa ini:** pola "asisten AI" dalam aplikasi perjalanan: kartu "Hi, I'm ALEXA"
dengan avatar **emoji** dan daftar suggestion chips.
**Ambil apa:** panel obrolan Daily Route perlu identitas yang *bukan* emoji
(`AGENTS.md` melarang emoji) dan suggestion chips harus bisa ditekan tanpa
menjadi "daftar fitur".
**Penilaian:** relevan untuk panel "Tanya" kita, tapi persis contoh yang
harus dihindari: emoji, nama produk sebagai nama orang, dan chip yang
terlalu banyak.

---

## C. Aplikasi transit & mobilitas — 6 tautan

### C1. HERE WeGo ✅
<https://www.here.com/products/wego>
**Apa ini:** perencana perjalanan HERE (1.900+ kota).
**Ambil apa:** deskripsi fitur resminya mengonfirmasi pola yang kita pakai —
"a comprehensive view of your entire trip, including walking times from your
starting point to your vehicle", dan "includes transfer suggestions for
transit journeys".
**Penilaian:** produk matang dengan arsitektur yang mirip; **antarmuka
visualnya tidak saya lihat langsung** (halaman produk + App Store).

### C2. Moovit — panduan navigasi ✅
<https://moovit.com/blog/navigating-with-moovit>
dan <https://moovitapp.com>
**Apa ini:** dokumentasi cara kerja aplikasi Moovit.
**Ambil apa:** urutan presentasi hasil yang disepakati industri: **total
travel time, arrival time, dan jumlah transfer** per opsi — tiga angka itu
sebelum detail apa pun. Ini mengonfirmasi aturan "durasi pertama" di
`DESIGN.md`.
**Penilaian:** konfirmasi norms, bukan panduan visual. Review pengguna
menyebut satu kelemahan yang relevan: "it may give you multiple bus
numbers… the bus number does not match" — battingis kita harus menampilkan
**satu** kode jalur per kaki.

### C3. Transit ✅ (dibuka di browser)
<https://transitapp.com/>
**Apa ini:** aplikasi transit besar (Acumen Public Media).
**Ambil apa:** hanya halaman pemasaran yang saya lihat; tidak sempat sampai
UI perencanaannya.
**Penilaian:** **tidak dipakai sebagai sumber visual**; tetap masuk daftar
karena perlu ditinjau manual (Anda atau agen lain) sebelum token dikunci.

### C4. Modeshift — Importance of UI/UX in public transit mobile apps ✅
<https://www.modeshift.com/mobile-ui-ux-public-transit-systems>
**Apa ini:** artikel desain UX untuk aplikasi transit.
**Ambil apa:** tiga aturan praktis yang berlaku untuk kita — (1) kurangi
jenis, (2) navigasi sederhana, (3) **legibilitas, kontras, dan tap-friendliness
di bawah terik matahari**. Ini sumber untuk keputusan "minimal typing",
"target sentuh 44 px", dan "baca di bawah terik".
**Penilaian:** artikel generik; yang diambil adalah nilainya, bukan gayanya. bukan gayanya.

### C5. Transjakarta — Wikipedia (armada & livery) ✅
<https://en.wikipedia.org/wiki/Transjakarta>
**Apa ini:** armada, kode jalur, dan livery operator.
**Ambil apa:** konfirmasi bahwa livery Transjakarta adalah **biru–putih**,
sedangkan Minitrans/Metrotrans adalah **oranye–putih** — alasan warna bus =
biru tidak menentang identitas operator.
**Penilaian:** sumber fakta; bukan referensi desain.

### C6. Jakpro / MRT Jakarta / LRT Jabodebek / KRL — identitas operator ✅
- LRT Jabodebek: <https://en.wikipedia.org/wiki/Jabodebek_LRT> dan
  <https://urbanistwanderer.com/2024/04/07/flawed-jabodebek-lrt-jakarta>
- KRL Commuterline: <https://en.wikipedia.org/wiki/KRL_Commuterline>
- Sistem terpadu: <https://en.wikipedia.org/wiki/Greater_Jakarta_Integrated_Mass_Transit_System>
- Brand Transjakarta: <https://logorary.com/transjakarta-logo>
**Apa ini:** warna jalur dan identitas tiap operator di Jabodetabek.
**Ambil apa:** **bukti konflik** yang jadi alasan kita tidak memakai warna
livery: LRT Jakarta dan KRL sama-sama merah; Transjakarta dan LRT Jabodebek
sama-sama biru; KRL sendiri punya lima warna jalur (Bogor merah,
Rangkasbitung hijau, Tangerang cokelat, Cikarang biru, Tanjung Priok merah
muda).
**Penilaian:** dipakai sebagai argumen, bukan sebagai sumber gaya.

---

## D. Kritik desain & "kenapa ini AI" — 5 tautan

### D1. Impeccable — katalog "Slop" ✅
<https://impeccable.style/slop>
**Apa ini:** katalog 59 aturan + 6 pola tinjauan; 11 contoh anti-pattern
dengan lapisan detektor.
**Ambil apa:** sumber utama daftar "jangan" di bagian 9. Yang paling relevan
untuk peta & transit: *Hairline border with wide shadow*, *Nested cards*,
*Monotonous spacing*, *Pulsing status dot*, *Border accent on rounded
element*, *Identical card grids*, *Flat type hierarchy*, *Tiny interface
text*, *Line length too long*, *Em-dash overuse*.
**Penilaian:** daftar paling berguna di semua riset ini — gratis, terukur,
dan bisa dijalankan sebagai linter terhadap `apps/web`.

### D2. Kosta Canatselis (Mania Design) — "Spot the Slop" ✅
<https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults>
**Apa ini:** tujuh tanda yang dia kenali dalam tiga detik.
**Ambil apa:** (1) tipografi tanpa opini — "Change the font before you change
anything else"; (2) gradien ungu→biru; (3) headline yang bisa milik siapa
saja; (4) **"uniform everything"** — radius dan padding yang sama membuat
halaman rata; (5) **state yang hilang** — "invisible in a screenshot and
fatal in use"; (6) gerak yang tidak ada atau seragam; (7) semua terlihat
seketika.
**Penilaian:** rujukan kedua setelah Impeccable; poin (5) adalah alasan
bagian 8 dokumen bahasa visual ada.

### D3. Dolly Borade Solanki — "AI Design Slop" ✅
<https://medium.com/@dollyborade07/ai-design-slop-why-ai-keeps-designing-the-same-dashboard-cards-gradients-and-rounded-corners-26d8e4779a86>
**Apa ini:** uraian panjang tentang Convergence & "slop = design with no
author".
**Ambil apa:** argumen **model collapse** (Shumailov et al., *Nature* 2024):
semakin banyak data generatif, semakin sempit ekor distribusi — dan desain
yang khas tinggal di ekor itu. Argumentasi yang tepat untuk prioritizing
keputusan visual yang *spesifik* (biru Transjakarta, bukan biru generik).
**Penilaian:** sangat baik dalam menjelaskan *mengapa*; tidak banyak
 prescriptive.

### D4. "The Purple Gradient Problem" ✅
<https://medium.com/@infoinletdev.five/the-purple-gradient-problem-why-ai-ui-all-looks-alike-and-how-to-fix-it-0c995c5c5c79>
**Apa ini:** daftar tanda yang bisa dihitung — Inter/Roboto, centered hero
dengan satu CTA, **baris 3 (atau 6) kartu rounded identik** dengan ikon +
heading + dua baris teks, glassmorphism, gradient text, bounce easing, nested
cards, radius sama untuk semuanya, shadcn-gray dan Tailwind-blue yang
disentuh mentah.
**Penilaian:** daftar periksa yang bisa dijalankan; paling berguna justru
frasa **"the same corner radius on absolutely everything"** — persis yang
kita lihat di kolom kiri Daily Route sekarang.

### D5. Alex Lavaee — "Why My AI-Generated UI Looked Generic" ✅
<https://alexlavaee.me/blog/lessons-learned-designing-with-ai>
**Apa ini:** catatan seorang desainer tentang mengarahkan agen.
**Ambil apa:** **the one-shot problem** — satu permintaan memaksa tiga
tugas sekaligus (keputusan visual, implementasi, integrasi sistem) dan model
mengambil rata-rata. Solusinya: **pisah arah dari kode** — tulis `DESIGN.md`
dulu, baru menulis CSS. Repo ini sudah punya `DESIGN.md`; dokumen ini adalah
perpanjangan yang bisa dipakai sebagai kontrak.
**Penilaian:** paling dekat ke How-To yang bisa langsung dipakai di repo ini.

### D6. Griffin Wooldridge — "Why Every AI-Generated UI Looks the Same" ✅
<https://www.youtube.com/watch?v=XKDfs9xTzfw>
**Apa ini:** video 7 menit yang memecah 7 pola dan menyebut Mobbin sebagai
referensi nyata.
**Ambil apa:** **uji 3 detik** — "could the design belong to almost any other
product in the same category?" Kalau ya, modelnya yang memberikan rata-rata.
Juga: "the problem is using these things because they're defaults instead of
because they're the right decision".
**Penilaian:** video; saya membaca transkripnya, tidak menonton. Argumentasi
yang sama dengan D2 dalam bentuk lebih pendek.

### D7. Refactoring UI (Adam Wathan & Steve Schoger) ✅
<https://refactoringui.com/>
dan ringkasannya: <https://maibuith.com/notes/refactoring-ui>
**Apa ini:** buku "design for developers"; situs resminya memuat daftar
isi lengkap.
**Ambil apa:** taktik yang dipakai di dokumen bahasa visual —
*use fewer borders*, *separate regions with background colors* (bukan border
dan bukan bayangan), *start with too much white space*, *establish a spacing
and sizing system*, *define your shades up front*, *don't rely on color
alone*, *use shadows to convey elevation*, *shadows can have two parts*,
*don't overlook empty states*, *don't blow up small icons*, *action buttons:
hierarchy first, semantics secondary*.
**Penilaian:** satu-satunya sumber di daftar ini yang berupa sistem, bukan
opini — karena itu dipakai sebagaidasar angka (batas 2 tingkat bayangan,
batas 3 radius).

### D8. NN/g — "Designing Empty States in Complex Applications" ✅
<https://www.nngroup.com/articles/empty-state-interface-design>
**Apa ini:** tiga panduan empty state (Kate Kaplan, 2021).
**Ambil apa:** tiga tugas empty state — *communicate system status*, *provide
learning cues*, *provide direct pathways* — plus peringatan bahwa pesan
status yang **tidak akurat** ("No records" sebelum proses selesai) adalah
yang paling merusak. Dasar langsung untuk bagian 8.1.
**Penilaian:** sumber primer; kutipannya persis.

### D9. Carbon Design System — empty states ✅
<https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states>
**Apa ini:** pola empty state dari design system IBM.
**Ambil apa:** aturan praktis — empty state harus **konsisten dengan produk**,
tidak boleh sendirian, dan untuk data yang ada tapi tidak bisa ditampilkan
("errors") harus menjelaskan *kenapa* tidak ada dan *apa yang bisa dilakukan*.
**Penilaian:** contoh implementasi yang bersih dari prinsip NN/g.

---

## E. Sistem warna transit — 4 tautan

### E1. TfNSW — Transport Network Colour Chart ✅
<http://opendata.transport.nsw.gov.au/developers/resources>
**Apa ini:** palet warna resmi Transport for NSW, **dengan hex**, per modus
dan per jalur.
**Ambil apa:** bukti bahwa otoritas transit besar_Enublish_ warna mode
resmi + tabel kepatuhan WCAG 2.0 AA, dan bahwa warnanya assigned
**per sistem/modus** (Metro #168388; Light Rail L1 #BE1622, L2 #DD1E25,
L3 #781140, L4 #BB2043; Regional Coach #732A82; T1–T9 masing-masing satu
hex). Model taksonomi yang kita tiru.
**Penilaian:** rujukan warna transit paling otoritatif yang bisa saya buka.
**Keterbatasan:** PNG "TfNSW modal colour palette" dan "WCAG 2.0 AA compliance
table" adalah gambar — **tidak bisa saya baca**, jadi palet modal TfNSW belum
terverifikasi.

### E2. Auckland Transport — design & brand guidelines ✅
<https://at.govt.nz/about-us/auckland-transport-design-and-brand-guidelines>
dan sistemnya: <https://en.wikipedia.org/wiki/Public_transport_in_Auckland>
**Apa ini:** panduan brand AT dan warna jalur Auckland (sejak 2026: South City
merah, East–West hijau, Onehunga West biru).
**Ambil apa:** contoh kedua bahwa **warna di level jalur**, bukan level
operator, adalah taksonomi yang dipakai praktik. Membandingkan dengan TfNSW:
dua sistem berbeda, dua palet berbeda, tapi prinsipnya sama.
**Penilaian:** sumber resmi; Zealandia jauh, tapi aturannya universal.

### E3. Metlink Brand Guidelines ✅
<https://fyi.org.nz/request/18693/response/71135/attach/6/Attachment%202%20Metlink%20Bus%20Livery%20Guidelines.pdf>
**Apa ini:** panduan brand Metlink (Wellington) termasuk bus livery.
**Ambil apa:** bukti bahwa sebuah jaringan plunder_authority **menerbitkan
panduan warna sendiri** — Metlink Blue PMS 303C / web-safe **#00364A**,
Metlink Green PMS 381C / web-safe **#C4DB0D** — dan melarang mencampur
warna pada poster ("Avoid mixing background and modal colours on posters").
**Penilaian:** menegaskan aturan disiplin warna yang kita jalankan di
`styles.css`.

### E4. Bern Ng — Greater Sydney Rail Network (Behance) 🟡
<https://www.behance.net/gallery/197247589/Greater-Sydney-Rail-Network-v92>
**Apa ini:** diagram jaringan Sydney.
**Ambil apa:** **hierarki warna per kelas moda** — Metro memakai warna
neon di atas latar gelap, Train memakai warna jenuh terang, Light Rail
memakai warna pastel. Prinsip "kelompok moda punya karakter warna sendiri"
yang persis kita pakai.
**Penilaian:** contoh kartografi kelas dunia; **halaman proyeknya hanya
saya baca sebagai teks**, gambar-gambarnya belum saya lihat.

---

## F. Papan dan shot yang saya lihat langsung (Dribbble / Behance) — 8 tautan

Semua dari tag <https://dribbble.com/tags/transit-app> dan
<https://dribbble.com/tags/public-transport-app>. Saya mengunduh 13 berkas
gambar asli dari CDN Dribbble dan **melihat** enam di antaranya.

### F1. "Citymapper - Public Transport App UI" (SHIMUL BILLAH) ✅ — 7,1 rb tayangan
<https://dribbble.com/shots/15488152-Citymapper-Public-Transport-App-UI>
**Apa ini:** concept fan-made Citymapper.
**Ambil apa:** cara memetakan moda sebagai **ikon di dalam lingkaran** di
peta, dan peta sebagai *latar* di atas sheet.
**Penilaian:** **jangan tiru** — latar lilac ungu dan kisi 8 ikon bulat
adalah dua tanda slop sekaligus ("purple gradient", "icon tile grid"). Tapi
konsep "kendaraan sebagai titik berwarna di atas peta" bagus.

### F2. "Smart Transit App – Route Planning UI/UX" ✅ — 4,8 rb
<https://dribbble.com/shots/26934690-Smart-Transit-App-Route-Planning-UI-UX>
(diOMO juga B4) **Penilaian:** lihat B4.

### F3. "Travel & Transit Mobile Experience" (Koushik Sarkar) ✅ — 9,8 rb
<https://dribbble.com/shots/27371984-Travel-Transit-Mobile-Experience>
**Apa ini:** render 3D interior bus.
**Ambil apa:** **tidak ada**. Ini pelajaran metodologis: shot dengan tayangan
tinggi belum tentu relevan.
**Penilaian:** saya termasukkan justru karena tidak relevan — penting agar
tidak ada yang spends waktu membukanya.

### F4. "Real Time Ride Discovery Map app" ✅ — 7,6 rb
<https://dribbble.com/shots/26361343-Real-Time-Ride-Discovery-Map-app>
**Apa ini:** aplikasi berbagi tumpukan.
**Ambil apa:** satu hal yang berguna — **peta occupies the top ~60 % dan
sheet di bawahnya**, dengan panel melayang berisi pilihan.
**Penilaian:** **kontra-pola penuh**. Indigo, pil nav, kartu rounded berisi
foto Porsche, chip badge — semua tanda slop yang Impeccable daftarkan. Ini
gambar yang paling sering dipakai AI sebagai "referensi" dan paling salah
untuk produk transit.

### F5. "Travel Assistant — Explore & Ask with Ease" ✅ — 4,1 rb
<https://dribbble.com/shots/26984283-Travel-Assistant-Explore-Ask-with-Ease>
(diOMO juga B5) **Penilaian:** lihat B5.

### F6. "Toronto public transit app." (Tonmoy Das) ✅ — 23,3 rb
<https://dribbble.com/shots/9381920-Toronto-public-transit-app>
(diOMO juga B3) **Penilaian:** lihat B3 — shot Dribbble paling berguna yang
saya lihat.

### F7. "Metro - Booking App" ✅ — 37 rb
<https://dribbble.com/shots/20327638-Metro-Booking-App>
**Apa ini:** konsep aplikasi pemesanan metro.
**Ambil apa:** belum saya lihat detailnya; hanya saya lihat di halaman tag.
**Penilaian:** 🟡 daftar untuk peninjauan manual.

### F8. "Redesigning KAI Access - Train Ticketing App" ✅ — 15 rb
<https://dribbble.com/shots/21962484-Redesigning-KAI-Access-Train-Ticketing-App>
**Apa ini:** redesain aplikasi tiket KAI — **produsen lokal**.
**Ambil apa:** belum saya lihat detailnya.
**Penilaian:** 🟡 menarik justru karena lokal (KAI = operator KRL juga);
prioritas tinjauan manual yang tinggi, karenapalet dan tipografi KAI
adalah referensi budaya yang lebih dekat daripada TfNSW.

### Behance — "Public Transport App" (9.000+ hasil) ✅ (teks)
<https://www.behance.net/search/projects/public%20transport%20app?locale=en_US>
**Apa ini:** papan Behance.
**Ambil apa:** nama proyek yang layak ditinjau manual — *WayBuddy* (9,4 rb),
*MyBus* (9,4 rb), *DozoR City* (9,1 rb), *Namma BMTC* (1,7 rb), *Suroboyo
Bus App Redesign* (2,3 rb), *Łódka* (2,1 rb), *Subte BA* (design system
 subway Buenos Aires), *Owa*, *Raah*, *VNGo*.
**Penilaian:** papan yang sangat besar; **halaman-halaman proyeknya
dirender dengan JavaScript sehingga saya hanya melihat teks + thumbnail**,
belum masuk ke salah satu pun. Behrank 9.000+ hasil membuat ini tidak bisa
disaring dengan tool; butuh penyaringan manual berdasarkan nama.
*Subte BA* layak dibuka pertama — iauller design system, bukan satu layar.

---

## G. Yang tidak bisa saya buka — 5 tautan

| Tautan | Kenapa gagal | Apa yang hilang |
| --- | --- | --- |
| <https://www.aucklandtransport.gov.nz/> | DNS gagal (`ERR_NAME_NOT_RESOLVED`) dari lingkungan ini | UI perencana perjalanan AT; saya memakai halaman brand guideline-nya di E2 sebagai gantinya |
| <https://mobbin.com/colors/brand/citymapper> | Dinding bayaran | Hex resmi Citymapper; sebagai gantinya saya sampling piksel dari `citymapper.com` (hijau #37ab2e, slate #417193) — lihat catatan di B1 |
| <https://www.bahn.de/> (DB Navigator), <https://www.oebb.at/>, <https://www.sncf-connect.com/> | Waktu riset habis sebelum sempat dibuka | UI DB Navigator / ScottyMobile / SNCF Connect — **celah nyata** dalam riset ini; semuanya aplikasiownload-first dan sulit dinilai dari teks |
| <https://www.kartaview.org/> | Ekstraksi mengembalikan kosong | KartaView (open-source mapillary untuk verification jalan) — tidak relevan untuk UI, jadi dampaknya kecil |
| <https://apps.apple.com/us/app/transit-bus-train-times/id1178546302> dan halaman App Store Citymapper/Transit | 404 / ID aplikasi berubah | Tangkapan layar App Store asli dari Citymapper dan Transit — tangkapan layar **resmi** dari UI aplikasi, yang akan jadi bukti terkuat untuk bagian B. Perlu ID yang benar atau Play Store |

---

## H. Ringkasan: 7 pelajaran yang bisa langsung dipakai

1. **Cek siapa yang benar-benar "designed".** Dari semua papan Dribbble yang
   saya lihat, hanya Citymapper (produk nyata) dan Toronto (skema transit
   yang masuk akal) yang punya bahasa visual sendiri. Sisanya — F1, F4 —
   menampilkan tanda slop yang persis didaftar Impeccable. **Papan Dribbble
   adalah sumber tanda yang harus dihindari, bukan sumber yang harus
   ditiru.**
2. **Skema transit (garis lurus, 45°, halte sebagai lingkaran putih) lebih
   terbaca daripada peta geografis** untuk menjelaskan *bentuk* perjalanan
   — tapi Daily Route memakai geografis karena tujuannya mencari rute di
   jalan Jakarta yang sebenarnya. Dua-duanya boleh berdampingan.
3. **Skema Toronto memberi dua ide konkret:** penanda halte = titik putih
   berlubang di atas garis berwarna, dan penanda kendaraan = pin bernomor.
4. **Mode colour selalu punya teman.** Di Toronto, kode jalur "504" tetap
   berwarna jalur-nya di dalam kalimat biasa. Di Citymapper, mode punya ikon
   sendiri. Warna sendirian tidak pernah cukup — dan angka ΔE00 di dokumen
   bahasa visual membuktikan bahwa lima warna tidak akan pernah cukup.
5. **Empty state dan memuat adalah separuh produk.**-citymapper, Toronto, dan
   seluruh kritik AI-slopagree di sini: yang membedakan produk yang terlihat
   "didesain" dari yang/generated* ada di state yang tidak terlihat di
   screenshot*.
6. **Uji kepribadian.** "Apakah desain ini bisa milik produk lain dalam kategori yang sama?" Kalau ya, itu rata-rata, bukan desain. Header 56 px + peta + daftar perjalanan + panel Tanya tidak akan pernah bisa milik aplikasi peta mana pun. Pastikan tidak ada bagian yang bisa.
   adalah uji paling cepat. Header 56 px + peta + daftar perjalanan + panel
   Tanya tidak akan pernah bisa milik aplikasi peta mana pun. Pastikan
   tidak ada bagian yang bisa.
7. **Papan besar perlu disaring manual.** Behance "public transport app"
   punya 9.000+ hasil dan dirender dengan JavaScript; tool tidak bisa
   menyaringnya. Saring berdasarkan nama, lalu buka enam sampai delapan
   proyek yang benar-benar terlihatnie.

---

## I. Daftar URL lengkap

**Peta & kartografi**
- https://docs.mapbox.com/android/navigation/v2/guides/ui-components/route-line
- https://docs.mapbox.com/style-spec/reference/layers
- https://docs.mapbox.com/mapbox-gl-js/guides/styles/work-with-layers
- https://medium.com/map-quest/how-to-design-interchanges-b9721af136a4
- https://geohubkenya.wordpress.com/2025/06/19/understanding-transit-maps-key-features-and-design-principles
- https://mtc.ca.gov/operations/transit-regional-network-management/regional-mapping-wayfinding
- https://mtc.ca.gov/sites/default/files/documents/2026-02/TransitStopSignageDesignGuide260217.pdf
- https://transitmap.net/symbols
- https://organicmaps.app/

**Produk**
- https://citymapper.com/
- https://content.citymapper.com/news/2521/our-global-walk-routing
- https://en.wikipedia.org/wiki/Citymapper
- https://ixd.prattsi.org/2026/02/design-critique-citymapper-ios-app
- https://www.here.com/products/wego
- https://moovitapp.com
- https://moovit.com/blog/navigating-with-moovit
- https://transitapp.com/
- https://www.modeshift.com/mobile-ui-ux-public-transit-systems

**Warna transit**
- http://opendata.transport.nsw.gov.au/developers/resources
- https://at.govt.nz/about-us/auckland-transport-design-and-brand-guidelines
- https://en.wikipedia.org/wiki/Public_transport_in_Auckland
- https://fyi.org.nz/request/18693/response/71135/attach/6/Attachment%202%20Metlink%20Bus%20Livery%20Guidelines.pdf
- https://www.behance.net/gallery/197247589/Greater-Sydney-Rail-Network-v92
- https://en.wikipedia.org/wiki/Transjakarta
- https://logorary.com/transjakarta-logo
- https://en.wikipedia.org/wiki/Jabodebek_LRT
- https://urbanistwanderer.com/2024/04/07/flawed-jabodebek-lrt-jakarta
- https://en.wikipedia.org/wiki/KRL_Commuterline
- https://en.wikipedia.org/wiki/Greater_Jakarta_Integrated_Mass_Transit_System

**Aksesibilitas warna**
- https://scifig.ai/blog/okabe-ito-color-palette-hex-codes
- https://conceptviz.app/blog/scientific-color-palette-for-research-papers-and-posters
- https://emitanaka.org/blog/2022-02-20-color-considerations/color-considerations.html
- https://www.webyes.com/blogs/color-blindness-accessibility
- https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/designing-maps-for-colorblind-readability
- https://colorbrewer2.org/
- https://www.viz-palette.com/

**Kritik desain**
- https://impeccable.style/slop
- https://www.mania.design/blog/spot-the-slop-a-ui-designers-guide-to-fixing-ai-defaults
- https://medium.com/@dollyborade07/ai-design-slop-why-ai-keeps-designing-the-same-dashboard-cards-gradients-and-rounded-corners-26d8e4779a86
- https://medium.com/@infoinletdev.five/the-purple-gradient-problem-why-ai-ui-all-looks-alike-and-how-to-fix-it-0c995c5c5c79
- https://alexlavaee.me/blog/lessons-learned-designing-with-ai
- https://www.youtube.com/watch?v=XKDfs9xTzfw
- https://refactoringui.com/
- https://maibuith.com/notes/refactoring-ui
- https://www.nngroup.com/articles/empty-state-interface-design
- https://www.carbondesignsystem.com/building-blocks/core/patterns/empty-states
- https://www.smashingmagazine.com/2011/03/technical-web-typography-guidelines-and-techniques

**Tipografi & lisensi**
- https://github.com/tokotype/PlusJakartaSans
- https://tokotype.github.io/plusjakarta-sans
- https://www.jetbrains.com/lp/mono
- https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt

**Papan**
- https://dribbble.com/tags/transit-app
- https://dribbble.com/tags/public-transport-app
- https://dribbble.com/search/route-planner-app
- https://www.behance.net/search/projects/public%20transport%20app?locale=en_US
- https://www.behance.net/search/projects/map%20app%20design%20transportation
- https://www.behance.net/search/projects/transport%20app%20case%20study
