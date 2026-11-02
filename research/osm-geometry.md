# Geometri rute dari OpenStreetMap — September 2026

Kenapa satu koridor pernah tergambar sebagai garis lurus, dan bagaimana
jalur yang benar dipertahankan.

## Gejala

Koridor 8 (Lebak Bulus–Pasar Baru) tergambar sebagai ruas-ruas lurus
yang menyambung halte satu ke halte berikutnya. Panjang jalurnya benar
(25,3 km) tetapi jalurnya tidak mengikuti jalan.

## Penyebab: bukan penyederhanaan, melainkan relasi yang salah

`packages/ingest/src/geometry.ts` menggambar garis lurus sebagai cadangan
bila ada satu halte yang berjarak lebih dari 500 m dari jalannya.
Penyederhanaan Douglas–Peucker dengan toleransi 3 m tidak mungkin
menyebabkan hal ini: ruas jalan asli antara Tanjung Duren dan Grogol
Reformasi punya 32–37 titik, dan penyederhanaan pada toleransi 3 m
masih menyisakan 10 titik. Bahkan pada toleransi 50 m masih ada tiga.

Penyebabnya adalah pilihan relasi. Ada dua relasi dengan `ref=8`:

| relasi | nama | anggota | kontinuitas |
| --- | --- | --- | --- |
| 6198078 | Pasar Baru → Lebak Bulus | 149 | utuh |
| 17019301 | Lebak Bulus → Pasar Baru | 129 | **10 pasang tidak menyambung**, celah terbesar 546,8 m |

Relasi 6198078 tidak memuat Jalan Pondok Pinang Raya dan Jalan Raden
Ajeng Kartini, tempat halte "Pondok Pinang" berdiri. Halte itu berjarak
**836,6 m** dari jalannya, sehingga seluruh geometri koridor jatuh ke
garis lurus. Pada relasi 17019301 semua halte berada dalam 55,1 m dari
jalannya.

Perbaikannya: relasi yang dipilih adalah yang jalannya masih memuat
halte-haltenya, bukan relasi pertama yang ditemukan. Halte-halte
digabungkan dari kedua relasi, sehingga tidak ada tempat yang hilang
karena satu relasi tidak menyebutnya.

## Tiga aturan yang sekarang berlaku

1. **Relasi yang tracing jalan dipilih.** Sebuah relasi ditolak bila
   salah satu haltenya berjarak lebih dari 500 m dari jalannya; di
   antara relasi yang lolos, yang paling banyak halte-nya yang dipilih,
   karena itu relasi yang paling mengenal koridor itu.
2. **Cadangan hanya untuk jalur yang memang tidak berguna.** Jalur
   dianggap tidak berguna bila **sebagian besar** haltenya jauh dari
   jalur, bukan bila satu halte saja. Beberapa ratus meter di satu
   tempat tidak boleh menghapus 25 km jalan yang benar.
3. **Nama jalan sebuah halte dari posisi halte itu.** Versi kedua
   penandaan transportasi publik di OSM (**PTv2**) menyebut seluruh
   halte lebih dulu dan baru kemudian seluruh jalan, jadi urutan anggota
   relasi tidak memberi tahu di mana sebuah halte berdiri. Posisi halte
   dihitung dengan proyeksi ke jalur yang sudah jadi.

## Yang masih belum selesai: celah antar jalan

Relasi 17019301 masih punya sepuluh pasang anggota jalan yang tidak
menyambung pada simpul yang sama, celah terbesar 546,8 m di Jalan
Sultan Iskandar Muda. `appendWay` tidak pernah memeriksa sambungan itu,
jadi tiap celah menjadi satu ruas lurus yang meloncat.

Rujukan yang dipakai untuk memutuskan hal ini:

- **OpenTripPlanner** memotong geometri per perhentian dan punya
  cadangan yang **diumumkan** sebagai masalah data
  ([ShapeGeometryTooFar](https://github.com/opentripplanner/OpenTripPlanner/blob/dev-2.x/application/src/main/java/org/opentripplanner/graph_builder/issues/ShapeGeometryTooFar.java));
  radius snap-nya 150 m
  ([GeometryProcessor](https://github.com/opentripplanner/OpenTripPlanner/blob/dev-2.x/application/src/main/java/org/opentripplanner/graph_builder/module/geometry/GeometryProcessor.java)).
- **Transitland** mengukur "stop too far from shape" dengan batas 100 m
  ([too_far_from_shape.go](https://github.com/interline-io/transitland-lib/blob/main/ext/bestpractices/too_far_from_shape.go))
  dan "shape max segment length" untuk lompatan
  ([shape_max_segment_length.go](https://github.com/interline-io/transitland-lib/blob/main/ext/bestpractices/shape_max_segment_length.go)).
- **gtfs-validator** memakai 100 m untuk bus dan 400 m untuk kereta
  ([StopToShapeMatcherSettings](https://github.com/MobilityData/gtfs-validator/blob/master/main/src/main/java/org/mobilitydata/gtfsvalidator/util/shape/StopToShapeMatcherSettings.java))
  dan penugasan yang tidak boleh mundur
  ([StopToShapeMatcher](https://github.com/MobilityData/gtfs-validator/blob/master/main/src/main/java/org/mobilitydata/gtfsvalidator/util/shape/StopToShapeMatcher.java)).
- **JOSM** menunjukkan celah tepat ketika simpul pertama sebuah jalan
  berbeda dari simpul terakhir jalan sebelumnya
  ([public_transport validator](https://wiki.openstreetmap.org/wiki/JOSM/Plugins/public_transport)).
- **PTNA** memeriksa celah itinerary pada relasi PTv2
  ([ptna.openstreetmap.de](https://ptna.openstreetmap.de)).

Jalan untuk menutup celah di bawah satu kilometer: mengambil jalan yang
menghubungkan dari OSM, atau meminta perute jalan (Valhalla atau OSRM).
Itu belum dikerjakan, jadi celah pendek masih tergambar sebagai ruas lurus.

Celah yang lebih panjang dari satu kilometer bukan celah jalan. Pada
banyak koridor, relasi OSM menaruh satu ruas pendek di terminus (Blok M,
Tanjung Priok) sebelum sisa rute. Menyambungkannya menarik garis lurus
17–28 km. Jahitan sekarang memutus rantai pada celah itu dan menyimpan
rantai yang panjangnya adalah rutenya. Ruas terminus yang memang berdiri
di ujung rute tetap disambung ke ujung itu.
