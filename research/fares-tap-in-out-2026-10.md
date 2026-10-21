# Tarif Transjakarta: tap in / tap out, transfer, dan integrasi multimoda

**Status per 21 Oktober 2026.** Laporan riset untuk aplikasi *Daily Route*. Hanya riset: tidak ada kode aplikasi yang diubah.

Tiga berkas yang dihasilkan:

| Berkas | Isi |
| --- | --- |
| `research/fares-tap-in-out-2026-10.md` | Laporan ini, Bahasa Indonesia, dengan kutipan dan URL sumber per klaim |
| `research/data/fares-tap-in-out.json` | Temuan terstruktur yang bisa dibaca mesin (`rules`, `pendingChanges`, `unverified`, `modelImpact`) |
| `research/tools/ux-visual/verify_fares.py` | Skrip yang mencocokkan temuan ini dengan `research/data/fares.json` yang ada dan mencetak baris yang perlu diubah. Skrip tidak pernah menulis ke `fares.json` |

---

## 0. Ringkasan eksekutif

Tujuh hasil yang mengubah model tarif aplikasi:

1. **Tarif Transjakarta tetap Rp3.500** (Rp2.000 bila tap-in 05.00-07.00), dan **tetap begitu Passenger tidak tap out**. Yang berubah cuma penagihannya: tarif ditahan sampai tap out, dan kalau tidak di-tap out, kartu terblokir serta biaya perjalanan sebelumnya ditarik pada tap-in berikutnya. **Tidak ada batas jam perjalanan tanpa tap out yang ditemukan.** [Keyakinan: tinggi untuk tarif, TIDAK TERVERIFIKASI untuk batas jam.]
2. **Pindah bus adalah boarding baru.** Tanpa skema integrasi, setiap bus yang dinaiki ditagih penuh. **Dengan kartu berlogo JakLingko, rangkaian perpindahan bus dalam 3 jam dibatasi Rp5.000 total** — ini dikonfirmasi kanal resmi PT Transjakarta pada 8 Februari 2026, jadi tidak lagi sekadar klaim Wikipedia. [Keyakinan: tinggi.]
3. **Tarif integrasi multimodal Rp10.000 hanya berlaku bila perjalanan memakai minimal dua MODA BERBEDA.** Pindah BRT ke BRT tidak pernah masuk skema itu. [Keyakinan: tinggi.]
4. **Tarif Rp2.500 "hanya hari kerja" adalah keyakinan yang salah.** Tidak ada sumber resmi mana pun yang membatasi skema integrasi pada hari kerja. Dasar hukum (Kepgub 733/2022), FAQ JakLingko 2026, dan Syarat & Ketentuan JakLingko tidak memuat syarat hari. Yang **tidak** boleh ditambahkan ke model adalah syarat hari pada integrasi. [Keyakinan: tinggi bahwa tidak ada pembatasan.]
5. **Kaki BRT di dalam paket integrasi bukan gratis dan bukan flat Rp2.500.** Rumusnya `min(Rp10.000, Rp2.500 + Rp250 x total km)`, dan Rp2.500 itu hanya *boarding fee*. [Keyakinan: tinggi.]
6. **Integrasi hanya mencakup Transjakarta BRT + MRT Jakarta + LRT Jakarta.** Non-BRT, Mikrotrans, KRL, dan LRT Jabodebek berada di luar skema; Mikrotrans dan non-BRT **memutus** skema bila dipakai di antara dua moda yang tercakup. [Keyakinan: tinggi.]
7. **Tarif 2027: tanggal dan cakupan operator sudah pasti, besarannya belum.** Yang berubah 1 Januari 2027 adalah Transjakarta, Transjabodetabek, dan Mikrotrans sekalian. **MRT Jakarta tidak ikut**; MRT dan LRT diatur terpisah. Angka Rp5.000 dan Rp10.000 adalah usulan DTKJ, bukan keputusan. [Keyakinan: tinggi untuk tanggal dan cakupan; angka TIDAK TERVERIFIKASI karena belum diumumkan.]

---

## 1. Tap in / tap out Transjakarta

### 1.1 Apakah tarif tetap Rp3.500 bila penumpang tidak tap out?

**Ya.** Tarifnya tidak berubah. Yang berubah adalah **kapan** tagihan ditarik.

PT Transportasi Jakarta, kanal resmi X, 30 Desember 2017:

> "Yang dimaksud dgn maksimum Rp 5000 per 3 jam adalah terhitung dari tap in pertama sampai dengan tap in terakhir. **Jika pelanggan tetap berada di kawasan Transjakarta tanpa tap out, tarif tetap Rp 3500 seperti yg berlaku selama ini**"

Sumber: <https://x.com/PT_Transjakarta/status/946911918056280064>

Jadi: Passenger yang naik pukul 05.20 (di dalam window 05.00-07.00) dan tidak pernah tap out tetap owes **Rp2.000**, bukan Rp3.500 dan bukan lebih. Passenger yang naik pukul 09.00 tetap owes **Rp3.500**.

Penagihan Settlement ditunda, bukan dihapus. Transjakarta, kanal resmi X, 6 Oktober 2025:

> "Jika tidak melakukan tap out pada saat menggunakan layanan Transjakarta, maka kartu akan **ter-reset otomatis pada saat tap in di perjalanan berikutnya** dengan pemotongan saldo sesuai dengan tarif pada perjalanan sebelumnya"

Sumber: <https://x.com/PT_Transjakarta/status/1975095888872898629>

Headline Divisi Sekretaris Perusahaan PT Transjakarta, Anang Rizkani Noor, 4 Oktober 2022:

> "Apabila pelanggan tidak melakukan tempel kartu baik saat naik atau turun, konsekuensinya **kartu akan terblokir**. Pelanggan perlu melakukan atur ulang (reset) dan **biaya perjalanan sebelumnya akan dikenakan pada perjalanan berikutnya**."

Sumber: <https://megapolitan.kompas.com/read/2022/10/04/19011811/naik-turun-bus-transjakarta-wajib-tap-in-tap-out-agar-kartu-tak-terblokir>

> **Konsekuensi untuk model:** tidak ada penalti dan tidak ada tarif tambahan untuk perjalanan Transjakarta tanpa tap out. Yang perlu ditampilkan ke pengguna hanyalah catatan: tap out wajib; kalau lupa, kartu diblokir dan biaya perjalanan sebelumnya ditarik pada perjalanan berikutnya.

### 1.2 Batas waktu maksimum perjalanan tanpa tap out

**TIDAK TERVERIFIKASI.** Tidak ditemukan sumber resmi mana pun yang menetapkan batas jam (2 jam 30 menit, 3 jam, atau angka lain) untuk perjalanan Transjakarta biasa yang tidak di-tap out.

Yang ada di lapangan adalah tiga hal lain, dan ketiganya **bukan** batas jam perjalanan:

| Yang ditemukan | Untuk siapa | Sifat |
| --- | --- | --- |
| Batas 180 menit | Skema tarif integrasi multimodal | Batas validitas tiket integrasi, bukan batas durasi perjalanan |
| Batas 3 jam | Skema integrasi internal Transjakarta (Rp5.000) | Batas validitas tiket integrasi |
| Penalti over-stay Rp5.000 setelah 2 jam | Area berbayar LRT Jakarta | Aturan operator LRT Jakarta, tidak berlaku untuk Transjakarta |

> **Konsekuensi untuk model:** jangan mengarang batas jam. Perlakukan perjalanan tanpa tap out sebagai tarif reguler yang biasa, dengan catatan penundaan tagihan.

### 1.3 Berapa lama kartu dapat digunakan kembali, dan adakah batas perjalanan per hari?

- **Setelah tap out yang benar, kartu dapat dipakai lagi seketika.** Tidak ada masa tenggang yang dipublikasikan.
- **Setelah tap out yang terlewat, kartu masuk status "sedang perjalanan".** Tap in berikutnya ditolak sekali, kartu di-reset otomatis, biaya perjalanan sebelumnya dipotong, dan barulah tap in berikutnya berhasil. Ini yang dijelaskan penumpang pada 2022: "Yang terblokir harus 3x tap, tap pertama gagal karena terblokir, tap ke dua buka blokir, tap ke tiga baru bisa masuk."
  Sumber: <https://news.detik.com/berita/d-6328000/1-kartu-1-penumpang-transj-berlaku-kini-wajib-tap-in-dan-tap-out-halte>
- **Aturan satu kartu satu penumpang** ("One Man One Ticket") berlaku sejak 4 Oktober 2022, diterapkan PT JakLingko bersama Transjakarta, MRT Jakarta, dan LRT Jakarta.
  Sumber: <https://m.beritajakarta.id/read/109943/pt-jaklingko-terapkan-one-man-one-ticket-dan-kewajiban-tap-in-tap-out>
- **Batas jumlah perjalanan per hari: TIDAK TERVERIFIKASI.** Tidak ada sumber resmi yang mengaturnya. Yang ada hanyalah larangan memakai satu kartu untuk dua orang berturut-turut di gerbang yang sama (Syarat & Ketentuan JakLingko).
- **Jeda minimum 10 menit antara tap out dan tap in berikutnya: TIDAK TERVERIFIKASI.** Hanya muncul sebagai klaim anggota komunitas di grup Facebook pengguna.

### 1.4 Saldo minimum kartu fisik

| Operator | Saldo minimum | Sumber |
| --- | --- | --- |
| Transjakarta (BRT + non-BRT) | **Rp5.000** | Kompas.com, 4 Oktober 2022; PT Transjakarta X, 4 Oktober 2022 |
| LRT Jakarta | Rp5.000 | FAQ LRT Jakarta |
| MRT Jakarta | Rp14.000 (Kartu Multi Trip) | Bank Mandiri; Kompas.com, 9 Oktober 2026 |
| LRT Jabodebek | Rp10.000 | lrtjabodebek.kai.id/metode-pembayaran |
| KRL Jabodetabek | Rp5.000 (KMT) | ketentuan KAI Commuter |

Kutipan:

> "Pelanggan juga perlu memiliki saldo minimum senilai Rp 5.000 untuk memanfaatkan layanan bus transjakarta. **Jika saldo di bawah Rp 5.000, pelanggan tidak dapat menggunakan layanan transjakarta, kecuali untuk layanan gratis.**"
> — <https://megapolitan.kompas.com/read/2022/10/04/19011811/naik-turun-bus-transjakarta-wajib-tap-in-tap-out-agar-kartu-tak-terblokir>

> "Pastikan saldo minimun kamu Rp 5.000 dan selalu tempelkan kartu kamu saat naik dan turun bus (tap in & tap out di setiap perjalanan yaa!"
> — <https://x.com/PT_Transjakarta/status/1577249359682768896>

Jakarta Smart City juga menulis: "Pengguna e-money melakukan aktivasi kartu di balance reader yang terdapat di stasiun maupun halte Jaklingko (hanya 1 kali diawal saja)."

### 1.5 Apakah tap in berlaku pada bus yang berbeda dalam jaringan yang sama?

**Ya, tap in berlaku di setiap bus yang dinaiki.** Pindah bus adalah boarding baru dengan tagihan baru, kecuali ada skema integrasi yang menutupinya.

- **Tanpa kartu berlogo JakLingko:** setiap bus yang dinaiki ditagih Rp3.500 (atau Rp2.000) penuh.
- **Dengan kartu berlogo JakLingko:** rangkaian perpindahan bus dalam 3 jam ditutup oleh skema integrasi internal Transjakarta dengan plafon **Rp5.000** (lihat bagian 3.2).

> **Konsekuensi untuk model:** estimator harus menghitung perjalanan baru per bus yang dinaiki, lalu menawarkan skema integrasi sebagai alternatif yang lebih murah. Tidak boleh langsung menjumlahkan Rp3.500 per bus tanpa cek plafon.

### 1.6 Ringkasan aturan tap in / tap out

| Aturan | Kondisi | Efek | Effective from | Keyakinan |
| --- | --- | --- | --- | --- |
| Tarif flat per boarding | Setiap hari; tarif ekonomis 05.00-07.00, reguler 07.01-04.59; BRT + non-BRT + Transjabodetabek | Aturan penuh Rp3.500 / Rp2.000; pita ditentukan waktu tap-in; ditagih saat tap out | 2005 (angka tarif), 2022-10-04 (mekanisme tap in/out) | tinggi |
| Tap in dan tap out wajib | Setiap hari; semua moda Transjakarta termasuk Mikrotrans | Tanpa efek harga; menentukan kapan tagihan ditarik dan status kartu | 2022-10-04 | tinggi |
| Penalti lupa tap out | Perjalanan ditutup tanpa tap out | Kartu terblokir; biaya perjalanan sebelumnya ditarik pada tap-in berikutnya; tarif reguler, bukan tambahan | 2022-10-04 | tinggi |
| Saldo minimum Rp5.000 | Kartu fisik, semua hari | Syarat akses, bukan komponen tarif | 2022-10-04 | tinggi |
| Pindah bus = boarding baru | Setiap perpindahan bus | Aturan penuh baru per bus, kecuali ditutup plafon integrasi | 2022-10-04 | tinggi |
| Mikrotrans gratis | Setiap hari; wajib tap in/out | Gratis; di luar skema integrasi dan **memutus** skema bila berada di antara dua moda yang tercakup | 2022-10-07 | tinggi |
| Royaltrans Rp20.000 | Setiap hari | Aturan penuh; tidak pernah tercakup integrasi | 2018 | tinggi |



---

## 2. Transfer antar bus Transjakarta

### 2.1 Apakah perlu tap out dan tap in lagi saat pindah bus?

**Ya, untuk setiap bus yang dinaiki.**

- BRT: tap in di gate masuk halte, tap out di gate keluar halte tempat turun.
- Non-BRT (Metrotrans, Minitrans, AMARI): tap on bus di dalam armada, untuk naik dan turun.

Pemprov DKI Jakarta:

> "Saat melakukan perjalanan menggunakan Transjakarta, penumpang **wajib melakukan Tap In saat memasuki Halte, dan Tap Out saat di Halte tujuan** setelah menyelesaikan perjalanan."

Sumber: <https://www.jakarta.go.id/transjakarta>

Berlaku sejak 4 Oktober 2022, seiring pemberlakuan tarif integrasi.

### 2.2 Apakah tarif baru dihitung dari nol, atau ada pengecualian?

**Ada dua jalur, dan keduanya resmi.**

| Jalur | Pemakaian | Biaya | Syarat |
| --- | --- | --- | --- |
| **Tarif reguler** | Setiap bus yang dinaiki | Rp3.500 (Rp2.000 bila tap-in 05.00-07.00) per bus | KUE biasa yang belum diaktivasi |
| **Integrasi internal Transjakarta** | Semua bus Transjakarta (BRT + non-BRT) dalam 3 jam | **Maksimum Rp5.000** untuk seluruh rangkaian | Kartu berlogo JakLingko |

PT Transportasi Jakarta, kanal resmi X, 8 Februari 2026:

> "Tersedia tarif integrasi maksimal Rp5.000,- (berlaku per 3 jam). Tarif integrasi ini dapat diperoleh dengan menggunakan **kartu berlogo JakLingko** saat menggunakan layanan **BRT maupun Non-BRT**. Jangan lupa untuk selalu tap in dan tap out."

Sumber: <https://x.com/PT_Transjakarta/status/2020622175766802528>

Perkembangan yang sama diumumkan ulang pada 24 Desember 2025 ("tarif integrasi Rp.5.000,- / 3 jam masih dapat dipakai dengan menggunakan kartu berlogo Jaklingko, dengan tetap melakukan proses tap in") dan masih berlaku pada 8 Februari 2026.

> **Koreksi penting terhadap data yang ada.** `research/data/fares.json` saat ini menandai skema ini sebagai `verified: false` dengan alasan "documented only on id.wikipedia". Sekarang **sudah terverifikasi** lewat kanal resmi operator. Istilah yang dipakai operator sendiri adalah "tarif integrasi" Transjakarta, bukan "OKOTRIP".

### 2.3 Tanggal resmi berlaku

| Tanggal | Peristiwa | Sumber |
| --- | --- | --- |
| 27 Juni 2022 | Rekomendasi DPRD DKI atas tarif integrasi | ANTARA |
| 8 Agustus 2022 | Kepgub DKI Jakarta No. 733 Tahun 2022 tentang Besaran Paket Tarif Layanan Angkutan Umum Massal ditandatangani | ANTARA |
| 11 Agustus 2022 | Uji coba tarif integrasi mulai berlaku | beritajakarta.id |
| 4 Oktober 2022 | One Man One Ticket + kewajiban tap in/tap out mulai berlaku | Kompas.com; beritajakarta.id |
| 7 Oktober 2022 | Peluncuran resmi implementasi tarif integrasi dan Mikrotrans | Kompas.id |
| 12 Oktober 2026 | MRT Jakarta menghubungkan seluruh KUE bank ke 186 reader JakLingko di 13 stasiun, sehingga integrasi multimodal benar-benar operasional di sisi MRT | Kompas.com, 9 Oktober 2026 |

---

## 3. Integrasi tarif JakLingko

Ada **dua** skema integrasi yang berbeda. Keduanya sering dikira satu, dan sumber-sumber pemberita pun mencampur keduanya.

| | Skema A: Integrasi Multimodal | Skema B: Integrasi internal Transjakarta |
| --- | --- | --- |
| Ruang lingkup | Antarmoda | Hanya di dalam jaringan Transjakarta |
| Moda | Transjakarta **BRT** + MRT Jakarta + LRT Jakarta | Transjakarta **BRT + non-BRT** |
| Minimum | **2 moda berbeda** | 1 bus boleh |
| Rumus | `min(10.000, 2.500 + 250 x total km)` | Maksimum **Rp5.000** |
| Jendela | 180 menit | 180 menit |
| Jangkar jendela | tap-out pertama ke tap-out terakhir | tap-in pertama ke tap-in terakhir |
| Media | Semua KUE bank yang didukung JakLingko + tiket QR aplikasi JakLingko (setelah aktivasi BCT) | Kartu berlogo JakLingko |
| Dasar hukum | Kepgub No. 733 Tahun 2022 | Pernyataan kanal resmi PT Transjakarta |
| Tanggal mulai | 11 Agustus 2022 (uji coba), 7 Oktober 2022 (peluncuran penuh) | Sudah ada pada 2017, masih diumumkan Februari 2026; **tanggal mulai yang presisi TIDAK TERVERIFIKASI** |

### 3.1 Apakah tarif integrasi hanya berlaku pada hari kerja?

**Tidak ada bukti pendukung, dan bukti yang ada mengarah sebaliknya.** Catatan awal yang menyebut versi "Rp2.500 weekday only" versus akhir pekan tarif penuh **tidak dapat dikuatkan dari satu pun sumber resmi**.

Yang diperiksa dan hasilnya:

| Sumber | Apa yang tertulis tentang hari | Tanggal |
| --- | --- | --- |
| Kepgub DKI Jakarta No. 733 Tahun 2022 (lampiran) | Syarat: 2 atau lebih moda, tarif kombinasi jarak dan waktu, 180 menit, tidak keluar dari SAUM. **Tidak ada syarat hari kerja.** | 8 Agustus 2022 |
| JakLingko, FAQ Tarif Integrasi (halaman aktif 2026) | "Rp2.500 + Rp250/km, plafon Rp10.000, 180 menit, 3 operator". **Tidak ada syarat hari.** | 2026 |
| JakLingko, Syarat & Ketentuan | "Batas waktu tarif integrasi adalah maksimal 180 menit". **Tidak ada syarat hari.** | 2026 |
| PT Transjakarta X (kedua skema) | "maksimal Rp5.000,- (berlaku per 3 jam)". **Tidak ada syarat hari.** | 8 Februari 2026 |
| PT Transjakarta, halaman rute SH2 | "Layanan tetap beroperasi **setiap hari** ... dengan tarif Rp3.500." | 20 Maret 2026 |
| PT Transjakarta, berita integrasi moda | "integrasi tarif lintas moda dengan batas maksimum (plafon) Rp10.000 untuk durasi perjalanan hingga 180 menit". **Tidak ada syarat hari.** | 7 September 2026 |

> **Kesimpulan tegas.** Kedua skema integrasi berlaku **setiap hari**: hari kerja, akhir pekan, dan hari libur nasional. **Jangan pernah menambahkan syarat hari pada skema integrasi.**
>
> Kemungkinan sumber kekeliruan: pembedaan hari kerja / akhir pekan yang **benar-benar ada** di jaringan Jakarta adalah **LRT Jabodebek** — plafon Rp20.000 pada jam sibuk Senin-Jumat, dan Rp10.000 pada Sabtu, Minggu, dan hari libur nasional. Pembedaan ini sering tertukar dengan skema integrasi.

### 3.2 Masa berlaku tiket integrasi

**180 menit (3 jam).** Ada perbedaan titik jangkar antar sumber, dan ini harus dicatat:

| Sumber | Jangkar jendela 180 menit |
| --- | --- |
| JakLingko, FAQ Tarif Integrasi | "dari **tap-out perdana** hingga **tap-out akhir**" |
| JakLingko, Syarat & Ketentuan | "perpindahan antarmoda tidak melebihi 180 menit **sejak tap-out awal**" |
| Bank Mandiri (Kartu e-Money) | "3 jam dengan catatan **tidak keluar dari sistem Jaklingko sejak pertama kali tap in**" |
| JakLingko, video resmi | "maks. 3 jam dari **tap in ke tap in selanjutnya**" (untuk skema internal Transjakarta) |
| PT Transjakarta X, 30 Desember 2017 | "**terhitung dari tap in pertama sampai dengan tap in terakhir**" (skema internal Transjakarta) |

> **Konsekuensi untuk model:** untuk skema multimodal pakai asumsi konservatif, yaitu hitung 180 menit dari awal perjalanan dan jangan anggap sesi integrasi bertahan lebih dari 180 menit. Untuk skema internal Transjakarta, anchor-nya tap-in ke tap-in.

### 3.3 Apakah mencakup KRL atau hanya BRT + MRT + LRT Jakarta?

**Hanya tiga operator: Transjakarta BRT koridor, MRT Jakarta, LRT Jakarta.**

JakLingko, FAQ Tarif Integrasi:

> "**Cakupan Moda — 3 Operator.** Integrasi resmi Transjakarta BRT koridor, MRT Jakarta, dan LRT Jakarta."

Dan Syarat & Ketentuan:

> "Wajib menggunakan **minimal 2 moda berbeda** (contoh: Transjakarta -> MRT Jakarta)."

Di luar skema: **non-BRT** (Metrotrans, Minitrans, AMARI), **Mikrotrans**, **Royaltrans**, **KRL Jabodetabek**, **LRT Jabodebek**, dan **Transjabodetabek**.

KRL secara eksplisit belum terintegrasi:

> "penetapan tarif di KRL Commuter Line masih belum terintegrasi dan menggunakan tarif umum yang berlaku saat ini"

Sumber: <https://id.wikipedia.org/w/index.php?title=KRL_Commuter_Line&action=raw> (mengutip keputusan resmi)

Tiket KRL **boleh dibeli** di aplikasi JakLingko (ABT QR / Pay-As-You-Go), dan KRL Access QR **boleh dipakai** di Transjakarta, MRT Jakarta, LRT Jakarta, dan LRT Jabodebek — tetapi **tarif KRL itu sendiri tidak terintegrasi**. Pindah ke atau dari KRL selalu menambah tarif penuh KRL.

### 3.4 Bagaimana tarif BRT di dalam paket integrasi dihitung?

**Bukan gratis, dan bukan flat Rp2.500.** Rp2.500 adalah *boarding fee*; sisanya adalah tarif jarak.

Kepgub 733/2022, dikutip ANTARA, 8 Agustus 2022:

> "Biaya awal yang ditetapkan adalah **Rp2.500** dengan tarif mencapai **Rp250 per kilometer**. Adapun plafon tarif maksimum sebesar **Rp10.000** dengan pembatasan waktu perjalanannya adalah selama **180 menit** atau tiga jam. … Skema tarif kombinasi itu yakni biaya awal Rp2.500 dikenakan kepada penumpang pada saat mereka memindai (tap in) di mesin halte/stasiun/layanan angkutan umum pengumpan (feeder). Kemudian, setelah penumpang membayar biaya awal, tarif perjalanan selanjutnya yang dibayar penumpang adalah berdasarkan jarak perjalanan yang ditempuh yaitu sebesar Rp250 per kilometer."

JakLingko, Syarat & Ketentuan:

> "Tarif dasar integrasi dimulai dari **boarding fee** sebesar Rp2.500, dengan pertambahan **Rp250 per kilometer berikutnya**, hingga mencapai **tarif batas maksimal** senilai Rp10.000 untuk seluruh perjalanan multi-moda."

Bank Mandiri:

> "Bagi pengguna kartu yang **hanya menggunakan 1 moda** dalam perjalanan, maka akan dikenakan tarif reguler di moda tersebut."

Contoh resmi JakLingko: MRT Lebak Bulus - Transjakarta Galunggung - LRT Kelapa Gading = **Rp22.500** bila dibayar terpisah, **Rp9.250** bila integrasi. (Rp2.500 + 27 km x Rp250 = Rp9.250.)

> **Konsekuensi untuk model:**
> - Rumus: `min(10.000, 2.500 + 250 x totalKm)` dengan `totalKm` menjumlahkan **semua** kaki, kaki BRT termasuk.
> - Satu moda saja: tarif integrasi tidak dipakai; penumpang membayar tarif reguler moda itu (BRT = Rp3.500).
> - Pindah BRT ke BRT: **tidak** memenuhi syarat "minimal 2 moda berbeda", jadi tidak bisa memakai skema multimodal.

### 3.5 Kapan skema integrasi diputus?

JakLingko, FAQ Tarif Integrasi:

> "Durasi transit antarmoda **melebihi 180 menit** sejak tap-out awal.
> Menggunakan **kartu bank berbeda** saat masuk gate transfer antar moda.
> **Lupa melakukan tap-out** pada moda sebelumnya, sehingga dikenakan denda default moda tersebut.
> **Perjalanan hanya menggunakan satu moda** (tidak terjadi integrasi antarmoda, sehingga dikenakan tarif flat/jarak reguler satu moda)."

Dan tentang moda yang belum masuk skema:

> "Semua moda tersebut, **BELUM** masuk ke dalam skema tarif integrasi. Dan jika moda tersebut terjadi **di antara** moda TransJakarta, MRTJ atau LRTJ, **akan memutus skema tarif integrasi** Anda."

Konsekuensi lewat 180 menit, Syarat & Ketentuan JakLingko:

> "Koneksi integrasi terputus secara otomatis oleh sistem CCHS. **Sesi perjalanan baru akan dimulai** dan dikenakan tarif normal moda reguler sampai lanjut ke moda berikutnya. Pengguna tetap wajib tap-out di stasiun/halte keluar untuk menghindari penalti."

Perhatikan tiga hal tentang moda yang tidak tercakup:

- **Mikrotrans gratis**, jadi sebagai kaki perjalanan Mikrotrans tidak menambah biaya. tetapi kemunculannya **di antara dua moda yang tercakup** memutus sesi integrasi, sehingga moda setelahnya dihitung ulang pada tarif reguler.
- **KRL dan LRT Jabodebek** juga berada di luar skema. JakLingko menulis bahwa "semua moda tersebut" (yaitu moda yang belum masuk ke skema tarif integrasi) memutus skema bila muncul di antara moda TransJakarta, MRTJ, atau LRTJ. Keduanya karena itu memutus sesi integrasi.
- **Non-BRT (Metrotrans, Minitrans, AMARI)** sama: berada di luar skema multimodal dan memutus sesi bila dipakai di antara dua moda yang tercakup.

> **Konsekuensi untuk model:** kaki yang berada di luar skema tidak boleh dihitung sebagai bagian dari perjalanan integrasi. Pada skema multimodal, kaki pertama di luar skema menutup sesi integrasi, dan semua kaki berikutnya dihitung pada tarif reguler masing-masing moda.

---

## 4. Tarif 2027

### 4.1 Apakah jumlah tarif baru sudah diumumkan?

**Belum.** Hanya tanggalnya yang diumumkan, pada 29-30 September 2026.

Gubernur DKI Jakarta Pramono Anung, Puncak Hari Perhubungan Nasional, Balai Samudra, Jakarta Utara, 29 September 2026:

> "Dengan jujur saya harus mengatakan, 1 Januari juga akan ada beberapa penyesuaian tarif harga untuk TransJakarta maupun TransJabodetabek."

Sumber: <https://mediaindonesia.com/megapolitan/939059/tarif-transjakarta-dan-transjabodetabek-disesuaikan-mulai-1-januari-2027> dan <https://www.cnnindonesia.com/nasional/20260929181611-20-1409653/tarif-transjakarta-dan-transjabodetabek-bakal-naik-1-januari-2027>

ANTARA, 2 Oktober 2026:

> "Hingga 1 Oktober 2026, Pemerintah Provinsi DKI Jakarta belum mengumumkan angka resmi tarif baru. Jadi, angka Rp5.000 yang belakangan ramai disebut belum menjadi tarif yang dipastikan berlaku."

Sumber: <https://www.antaranews.com/berita/5768293/tarif-transjakarta-2027-jadi-rp5000-ini-fakta-terbarunya>

The Jakarta Globe, 29 September 2026:

> "The new Transjakarta fares have yet to be announced. … It also remains unclear whether the increase will follow a recommendation from the Jakarta Transportation Council (DTKJ), which has proposed raising the Transjakarta fare to Rp5,000 and the Transjabodetabek fare to Rp10,000."

Sumber: <https://jakartaglobe.id/news/jakarta-to-raise-transjakarta-fares-from-january-2027>

> **Angka tarif baru: TIDAK TERVERIFIKASI karena belum diumumkan. Jangan mengarang angka.**

### 4.2 Untuk operator mana saja berlaku?

Ini bagian yang perluagat, karena sumber berbeda.

**Pernyataan langsung gubernur** di Balai Kota DKI Jakarta, Rabu 30 September 2026:

> "Jadi tarif yang akan mengalami penyesuaian adalah **tarif untuk TransJakarta dan TransJabodetabek**."
> "Mikrotrans diatur bersamaan dengan kan itu satu rumpun Transjakarta, Transjabodetabek, Mikrotrans, Jaklingko itu kan satu rumpun jadi itu diatur bersamaan akan diumumkan angkanya berapa **tapi mulai efektif 1 Januari**."
> "Untuk MRT, LRT akan diatur kemudian," kata Pramono.

Sumber: <https://www.metrotvnews.com/read/kWDCmYyM-tarif-transjakarta-naik-januari-2027-mrt-lrt-menyusul>

Ringkasnya:

| Operator | Ikut 1 Januari 2027? | Keyakinan |
| --- | --- | --- |
| Transjakarta (BRT, non-BRT, AMARI, bus ke rusun) | **Ya** | tinggi |
| Transjabodetabek | **Ya** | tinggi |
| Mikrotrans / JakLingko | **Ya, sekalian** | tinggi |
| MRT Jakarta | **Tidak** | tinggi |
| LRT Jakarta | **Tidak tegas / sumber berbeda** | rendah |

> **Soal MRT: catatan awal Anda benar.** Kutipan gubernur eksplisit: MRT dan LRT "akan diatur kemudian". Jadi MRT **tidak** ikut perubahan 1 Januari 2027.
>
> **Soal LRT Jakarta: sumber berkonflik.** Kompas.com (30 September 2026) dan Kompas.id menulis penyesuaian 1 Januari 2027 juga mencakup LRT Jakarta, dan judul Kompas TV menyebut "Transjakarta, LRT hingg MRT". OneNews membaca pengumuman yang sama sebagai mencakup MRT Jakarta. Semua itu **bertentangan dengan kutipan langsung gubernur**. Sumber primer menang: perlakukan LRT Jakarta sebagai belum berubah sampai ada Ketetapan Gubernur atau Kepgub baru.

### 4.3 Usulan DTKJ (belum berlaku)

Ketua DTKJ periode 2026-2029, Sugihardjo, 3 Juli 2026:

> "Sekarang yang diusulkan DTKJ tarifnya itu disederhanakan menjadi hanya dua kelompok. Tarif di dalam wilayah kota Jakarta dengan TransJakarta … Price: jadi gabungan **Mikrotrans** terus apa lagi, **BRT, non-BRT itu satu tarif**. Jadi hanya ada dua kelompok tarif."

Sumber: <https://www.gridoto.com/read/224393148/persiapan-tarif-transjakarta-diusulkan-naik-jadi-rp-5-ribu-jaklingko-ikut-berbayar>

| Usulan | Nilai | Status |
| --- | --- | --- |
| Semua layanan dalam wilayah kota Jakarta (BRT + non-BRT + Mikrotrans) | Rp5.000 / 3 jam | **Usulan**, belum diputuskan |
| Transjabodetabek | Rp10.000 / 3 jam | **Usulan** |
| Mikrotrans (ususan terpisah 7 Juli 2026) | Rp2.000 / 3 jam | **Usulan**, dan beberapa pemberita menulisnya ikut paket Rp5.000 |
| Paket langganan | Rp200.000 / bulan | **Usulan** |

> **Jangan memakai angka ini sebagai tarif aktif.** Simpan sebagai `proposal` dengan `status: proposal` dan `effectiveFrom` kosong.

### 4.4 Perkara lain yang sudah berlaku dan tidak terkait tarif 2027

| Perkara | Nilai | Effective from | Sumber |
| --- | --- | --- | --- |
| Transbandara Blok M - Bandara Soekarno-Hatta | Rp15.000 | 1 September 2026 | Kepgub No. 685 Tahun 2026 |
| Penerima tarif gratis | 15 -> **21** golongan | 1 Januari 2027 | Pramono Anung, 29 September 2026 |

---

## 5. Bentuk data JSON untuk model tarif

Bentuk yang dipakai `research/data/fares-tap-in-out.json`, dan yang advisable untuk model tarif:

```jsonc
{
  "id": "integration-multimodal-3mode",
  "name": "Tarif Integrasi Multimodal JakLingko (Transjakarta BRT + MRT Jakarta + LRT Jakarta)",
  "operator": "jaklingko",
  "status": "official",            // official | officialOperatorChannel | proposal | operatorPractice | communityClaim
  "confidence": "high",            // high | medium | low
  "effectiveFrom": "2022-08-11",   // null bila belum berlaku / belum terverifikasi
  "modes": ["transjakarta-brt", "mrt-jakarta", "lrt-jakarta"],
  "conditions": {
    "days": "any",                 // "any" | "weekdays" | list of ISO weekday
    "minimumModes": 2,
    "boardingFee": 2500,
    "perKm": 250,
    "cap": 10000,
    "windowMinutes": 180,
    "windowAnchor": "tapOutToTapOut",   // tapOutToTapOut | tapInToTapIn
    "covers": ["transjakarta-brt", "mrt-jakarta", "lrt-jakarta"],
    "doesNotCover": ["transjakarta-non-brt", "transjakarta-mikrotrans", "krl-jabodetabek", "lrt-jabodebek"]
  },
  "effect": {
    "type": "cap",                 // fullFare | additionalCharge | cap | exempt | notCovered | noEffect
    "formula": "min(10000, 2500 + 250 * totalDistanceKm)",
    "amounts": { "boardingFee": 2500, "perKm": 250, "cap": 10000 },
    "brtInsidePackage": "BRT BUKAN gratis dan BUKAN flat Rp2.500. Biaya awal Rp2.500 adalah boarding fee, lalu Rp250 per kilometer untuk seluruh jarak perjalanan integrasi."
  },
  "sources": [
    { "url": "https://...", "quote": "...", "publisher": "...", "publishedAt": "2026-..." }
  ]
}
```

Prinsip yang dipakai:

- **`effectiveFrom` per aturan.** Aturan yang belum berlaku punya `effectiveFrom: null` atau tanggal Electoral yang belum tercapai, dan `status: proposal`. Tidak ada satu pun angka yang belum diumumkan yang ditulis sebagai tarif aktif.
- **`source` per aturan**, minimal satu, dengan kutipan yang bisa diperiksa.
- **`status` membedakan RESMI dari PERGAMBARAN.** `official` = ada dokumen atau pernyataan resmi. `officialOperatorChannel` = kanal resmi operator tetapi tanpa dokumen tertulis. `proposal` = usulan. `communityClaim` = klaim pengguna. Tidak ada status "pasti" tanpa sumber.
- **`confidence` terpisah dari `status`.** Aturan bisa resmi dan tetap punya keyakinan rendah bila sumbernya saling bertentangan.
- **`days` eksplisit di setiap aturan**, supaya model tidak pernah diam-diam menambahkan syarat hari. Skema integrasi = `"any"`.
- **`effect.type` menyatakan efeknya**: `fullFare` (aturan penuh), `additionalCharge` (biaya tambahan), `cap` (plafon), `exempt` (gratis), `notCovered` (di luar skema), `noEffect` (administratif).
- **Bagian `unverified`** adalah daftar terbuka. Setiap entri menyebut apa yang tidak terverifikasi, mengapa, dan konsekuensinya untuk model. Ini yang mencegah angka spekulatif masuk ke kode.
- **`modelImpact.changes`** menerjemahkan temuan menjadi perubahan konkret di `packages/transit/src/fare.ts` dan `research/data/fares.json`.

---

## 6. Daftar angka yang TIDAK bisa diverifikasi

| Nomor | Status | Catatan |
| --- | --- | --- |
| Batas jam perjalanan Transjakarta tanpa tap out (2 jam 30 menit? 3 jam?) | **TIDAK TERVERIFIKASI** | Tidak ada sumber resmi. Yang ada: batas 180 menit untuk skema integrasi, penalti over-stay LRT Jakarta Rp5.000 setelah 2 jam. Jangan mengarang batas jam. |
| Batas jumlah perjalanan per hari per kartu | **TIDAK TERVERIFIKASI** | Tidak ada sumber resmi. Yang ada: satu kartu satu penumpang. |
| Jeda minimum 10 menit antara tap out dan tap in berikutnya | **TIDAK TERVERIFIKASI** | Hanya klaim komunitas di grup Facebook. |
| Cara pembagian biaya di dalam plafon Rp5.000 / 3 jam skema internal Transjakarta | **TIDAK TERVERIFIKASI** | Sumber 2026 hanya menyebut "maksimum Rp5.000 per 3 jam". Indikasi 2017 dan contoh Traveloka: boarding pertama tarif reguler, berikutnya top-up sampai plafon. |
| Tanggal mulai berlaku skema integrasi internal Transjakarta (Rp5.000 / 3 jam) | **TIDAK TERVERIFIKASI** | Sudah ada 2017, masih diumumkan Februari 2026, tanggal penetration tidak ditemukan. |
| Angka tarif baru Transjakarta / Transjabodetabek / Mikrotrans untuk 1 Januari 2027 | **BELUM DIUMUMKAN** | ANTARA 2 Oktober 2026 dan The Jakarta Globe 29 September 2026. Angka DTKJ hanya usulan. |
| Apakah LRT Jakarta ikut kenaikan 1 Januari 2027 | **BERBEDA / TIDAK TEPAS** | Kutipan gubernur: MRT dan LRT "akan diatur kemudian". Kompas menulis LRT Jakarta termasuk. Sumber primer menang. |
| Penalti lupa tap out: tarif perjalanan sebelumnya atau tarif maksimal rute terjauh | **BERBEDA ANTAR SUMBER** | Transjakarta dan detikNews: perjalanan sebelumnya. JakLingko S&K: rute terjauh. Untuk Transjakarta hasilnya sama (Rp3.500); untuk MRT (Rp14.000) dan LRT Jakarta (Rp5.000) berbeda. Ambil yang lebih besar sebagai kasus terburuk. |
| Syarat hari untuk skema integrasi | **TERTOLAK - TIDAK ADA DASAR** | Tidak ada sumber yang membatasi. Keyakinan "Rp2.500 weekday only" tidak dapat dikuatkan. |

---

## 7. DAFTAR SUMBER

### Primer - dokumen dan halaman resmi

- Kepgub DKI Jakarta No. 733 Tahun 2022 tentang Besaran Paket Tarif Layanan Angkutan Umum Massal, 8 Agustus 2022 - lewat ANTARA: <https://m.antaranews.com/berita/3051305/anies-tetapkan-tarif-integrasi-untuk-transportasi-massal-rp10000>
- PT Jakarta Lingko Indonesia, FAQ Tarif Integrasi (halaman aktif 2026): <https://jaklingkoindonesia.co.id/faq-tarif-integrasi>
- PT Jakarta Lingko Indonesia, Syarat & Ketentuan: <https://jaklingkoindonesia.co.id/syarat-dan-ketentuan>
- PT Jakarta Lingko Indonesia, FAQ Aplikasi: <https://jaklingkoindonesia.co.id/faq-aplikasi>
- Pemerintah Provinsi DKI Jakarta, halaman Transjakarta (Dishub): <https://www.jakarta.go.id/transjakarta>
- Pemerintah Provinsi DKI Jakarta, halaman Jaklingko: <https://www.jakarta.go.id/jaklingko>
- PT Transportasi Jakarta, berita integrasi moda dan elektrifikasi, 7 September 2026: <https://transjakarta.co.id/berita/transjakarta-akselerasi-integrasi-moda-dan-elektrifikasi-armada-demi-mobilitas-berkelanjutan>
- PT Transportasi Jakarta, modifikasi rute SH2, 20 Maret 2026: <https://transjakarta.co.id/news/transjakarta-modifikasi-rute-sh2-blok-m-bandara-soekarno-hatta-perkuat-konektivitas-dan-kenyamanan-pelanggan>
- PT Transportasi Jakarta, QRIS Tap BRImo, 10 Maret 2026: <https://transjakarta.co.id/berita/revolusi-pembayaran-transportasi-transjakarta-adopsi-teknologi-qris-tap-lewat-aplikasi-brimo>
- PT Transportasi Jakarta, kanal resmi X, 8 Februari 2026 (tarif integrasi Rp5.000 / 3 jam): <https://x.com/PT_Transjakarta/status/2020622175766802528>
- PT Transportasi Jakarta, kanal resmi X, 24 Desember 2025: <https://x.com/PT_Transjakarta/status/2002292728324108671>
- PT Transportasi Jakarta, kanal resmi X, 30 Desember 2017 (jangkar jendela 3 jam dan tarif tanpa tap out): <https://x.com/PT_Transjakarta/status/946911918056280064>
- PT Transportasi Jakarta, kanal resmi X, 6 Oktober 2025 (reset otomatis dan pemotongan saldo): <https://x.com/PT_Transjakarta/status/1975095888872898629>
- PT Transportasi Jakarta, kanal resmi X, 4 Oktober 2022 (reset kartu dan saldo minimum): <https://x.com/PT_Transjakarta/status/1577249359682768896>
- PT Jakarta Lingko Indonesia, video resmi "Tarif Integrasi always ON": <https://www.facebook.com/jaklingkoindonesia/videos/tarif-integrasi-always-on-yagunakan-minimal-2-moda-antara-mrt-lrt-jakarta-dan-tj/2717472391954473>
- Bank Mandiri, e-Money Tarif Integrasi di Jaklingko Indonesia: <https://www.bankmandiri.co.id/en/emoney-tarif-integrasi-di-jaklingko-indonesia>
- PT LRT Jabodebek, informasi tarif: <https://lrtjabodebek.kai.id/informasi-tarif>
- PT LRT Jabodebek, metode pembayaran: <https://lrtjabodebek.kai.id/metode-pembayaran>
- JDIH Provinsi DKI Jakarta, Kepgub No. 685 Tahun 2026 (Transbandara Rp15.000): <https://jdih.jakarta.go.id/link/download-fulltext/15051>

### Pemberita

- Metro TV News, 30 September 2026 - kutipan langsung gubernur tentang cakupan operator 2027: <https://www.metrotvnews.com/read/kWDCmYyM-tarif-transjakarta-naik-januari-2027-mrt-lrt-menyusul>
- ANTARA News, 2 Oktober 2026 - angka baru belum diumumkan: <https://www.antaranews.com/berita/5768293/tarif-transjakarta-2027-jadi-rp5000-ini-fakta-terbarunya>
- CNN Indonesia, 29 September 2026: <https://www.cnnindonesia.com/nasional/20260929181611-20-1409653/tarif-transjakarta-dan-transjabodetabek-bakal-naik-1-januari-2027>
- Media Indonesia, 29 September 2026: <https://mediaindonesia.com/megapolitan/939059/tarif-transjakarta-dan-transjabodetabek-disesuaikan-mulai-1-januari-2027>
- Kompas.com, 30 September 2026 - "Tarif Transjakarta dan Transjabodetabek Naik 1 Januari 2027: MRT, LRT hingga Mikrotrans Menyusul": <https://megapolitan.kompas.com/read/2026/09/30/17232161/tarif-transjakarta-dan-transjabodetabek-naik-1-januari-2027-mrt-lrt>
- Kompas.com, 9 Oktober 2026 - integrasi reader JakLingko di MRT: <https://megapolitan.kompas.com/read/2026/10/09/19265511/pembayaran-mrt-terintegrasi-jaklingko-mulai-12-oktober-ini-daftar-kartu>
- Kompas.id, 2 Oktober 2026 - skema tarif baru dan DTKJ: <https://www.kompas.id/artikel/tarif-transjakarta-disesuaikan-mulai-2027-akses-transportasi-gratis-diperluas>
- Kompas.id, Oktober 2026 - usulan skema tarif baru berbasis Rp5.000 per 3 jam: <https://www.kompas.id/artikel/skema-tarif-baru-ditopang-kepuasan-pengguna-transjakarta>
- Kompas.id, 2022 - pengumuman tarif integrasi: <https://www.kompas.id/artikel/sistem-tarif-integrasi-diluncurkan>
- Kompas.com, 4 Oktober 2022 - tap in/tap out dan saldo minimum: <https://megapolitan.kompas.com/read/2022/10/04/19011811/naik-turun-bus-transjakarta-wajib-tap-in-tap-out-agar-kartu-tak-terblokir>
- Kompas.com, 12 Agustus 2022 - fakta-fakta tarif integrasi: <https://megapolitan.kompas.com/read/2022/08/12/07131771/fakta-fakta-soal-tarif-integrasi-transportasi-umum-di-jakarta-biaya>
- detikNews, 4 Oktober 2022 - 1 kartu 1 penumpang: <https://news.detik.com/berita/d-6328000/1-kartu-1-penumpang-transj-berlaku-kini-wajib-tap-in-dan-tap-out-halte>
- beritajakarta.id, 5 Oktober 2022 - One Man One Ticket: <https://m.beritajakarta.id/read/109943/pt-jaklingko-terapkan-one-man-one-ticket-dan-kewajiban-tap-in-tap-out>
- beritajakarta.id, 11 Agustus 2022 - tarif integrasi resmi berlaku, cakupannya hanya BRT pada tahap awal: <https://m.beritajakarta.id/read/105955/tarif-integrasi-resmi-berlaku-hari-ini-di-tiga-moda-transportasi>
- The Jakarta Globe, 29 September 2026: <https://jakartaglobe.id/news/jakarta-to-raise-transjakarta-fares-from-january-2027>
- GridOto.com, 4 Juli 2026 - usulan DTKJ: <https://www.gridoto.com/read/224393148/persiapan-tarif-transjakarta-diusulkan-naik-jadi-rp-5-ribu-jaklingko-ikut-berbayar>
- rm.id, 11 Agustus 2022 - kutipan lampiran Kepgub: <https://rm.id/baca-berita/megapolitan/135992/dki-terapkan-tarif-integrasi-antarmoda-rp-10-ribu>

### Sekunder dan rujukan

- Wikipedia Bahasa Indonesia, Transjakarta (raw): <https://id.wikipedia.org/w/index.php?title=Transjakarta&action=raw>
- Wikipedia Bahasa Indonesia, KRL Commuter Line (raw): <https://id.wikipedia.org/w/index.php?title=KRL_Commuter_Line&action=raw>

---

## 8. Ringkasan temuan per nomor

| Nomor | Pertanyaan | Jawaban | Keyakinan |
| --- | --- | --- | --- |
| 1a | Tarif tetap Rp3.500 / Rp2.000 tanpa tap out? | Ya, tarif tidak berubah; tagihan ditunda, kartu diblokir, biaya ditarik di tap-in berikutnya | tinggi |
| 1b | Batas jam perjalanan tanpa tap out | Tidak ada batas jam yang dipublikasikan | **TIDAK TERVERIFIKASI** |
| 1c | Durasi pakai ulang kartu, batas perjalanan per hari | Bisa dipakai lagi setelah tap out; tidak ada cooldown; **batas harian tidak ada** | tinggi / **TIDAK TERVERIFIKASI** |
| 1d | Saldo minimum kartu fisik | Rp5.000 untuk Transjakarta | tinggi |
| 1e | Tap in pada bus berbeda | Ya, boarding baru; ditutup plafon Rp5.000 bila kartu JakLingko | tinggi |
| 2 | Transfer antar bus | Perlu tap out dan tap in lagi; tarif penuh per bus tanpa skema; maks Rp5.000 / 3 jam dengan kartu JakLingko | tinggi |
| 3a | Integrasi hanya hari kerja? | **Tidak ada dasar. Berlaku setiap hari.** | tinggi |
| 3b | Masa berlaku 180 menit, mencakup KRL? | 180 menit; hanya BRT + MRT + LRT Jakarta; KRL dan LRT Jabodebek di luar | tinggi |
| 3c | Tarif BRT di dalam paket | Bukan gratis, bukan flat Rp2.500: `min(10.000, 2.500 + 250 x totalKm)` | tinggi |
| 4 | Tarif 2027 | Tanggal dan cakupan pasti; **besarannya belum diumumkan**; Transjakarta + Transjabodetabek + Mikrotrans; MRT tidak ikut; LRT Jakarta tidak tegas | tinggi untuk tanggal dan cakupan, TIDAK TERVERIFIKASI untuk angka |
| 5 | Format JSON | Lihat bagian 5 dan `research/data/fares-tap-in-out.json` | - |
