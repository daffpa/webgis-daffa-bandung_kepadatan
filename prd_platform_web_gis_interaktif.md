# Product Requirement Document (PRD): Platform Web GIS Interaktif Modern

**Versi:** 1.0  
**Status:** Draft MVP  
**Tanggal:** 24 Mei 2026  

---

## 1. Ringkasan Eksekutif & Visi Produk
Platform Web GIS Interaktif Modern ini dirancang untuk mengatasi kejenuhan pasar terhadap aplikasi pemetaan konvensional yang cenderung kaku, lambat, dan memiliki antarmuka pengguna yang kompleks (*legacy GIS*). Visi utama dari produk ini adalah menyajikan visualisasi data spasial *multi-layer* berkinerja tinggi yang dibungkus dalam UI/UX modern, intuitif, dan responsif. 

Aplikasi ini akan memprioritaskan kelancaran rendering data (60 FPS) menggunakan teknologi visualisasi berbasis akselerasi perangkat keras (WebGL/WebGPU), sehingga pengguna dari kalangan non-teknis maupun pengambil keputusan dapat mengeksplorasi wawasan berbasis lokasi secara *real-time* tanpa hambatan performa.

---

## 2. Analisis User Persona
Untuk memastikan produk tepat sasaran, pengembangan fungsionalitas didasarkan pada dua persona utama berikut:

* **Data Analyst / GIS Administrator:** Bertanggung jawab penuh dalam mengunggah, memperbarui, dan mengurasi dataset spasial (seperti format GeoJSON atau Shapefile). Membutuhkan dasbor manajemen data yang ringkas serta validasi skema data otomatis sebelum dipublikasikan ke peta utama.
* **General User / Pengambil Keputusan:** Konsumen akhir informasi yang menggunakan peta untuk memantau tren operasional, menganalisis wilayah potensial, atau menyusun laporan strategi bisnis. Kelompok ini membutuhkan antarmuka yang bersih, fungsi pencarian yang cerdas, filter yang cepat, dan visualisasi yang langsung memberikan pemahaman kognitif tinggi (misal: visualisasi *heatmap* atau *clustering*).

---

## 3. Spesifikasi Fungsional & Fitur Utama (MVP Scope)
Berikut adalah rincian fungsionalitas minimum yang wajib diimplementasikan pada fase pertama (MVP):

### 3.1 Modul Peta Utama (Dynamic Map Canvas)
* Aplikasi wajib mengintegrasikan basemap interaktif yang mendukung perpindahan mode gelap (*Dark Mode*) dan mode terang (*Light Mode*) untuk kenyamanan analisis di berbagai kondisi pencahayaan.
* Peta harus mendukung interaksi standar secara mulus: melakukan pembesaran (*Zooming*), penggeseran (*Panning*), serta rotasi dan kemiringan perspektif (*Tilt/Pitch*) untuk mengaktifkan sudut pandang semi-3D.
* Sistem rendering menggunakan *Vector Tiles* agar pelabelan jalan, teks, dan batas administratif tetap tajam pada tingkat kedalaman zoom apa pun tanpa merusak memori peramban (*browser memory*).

### 3.2 Panel Manajemen Layer (Spatial Layer Management)
* Menyediakan panel kontrol di sisi samping (*collapsible sidebar*) yang memungkinkan pengguna menyalakan atau mematikan visualisasi data spasial (titik, garis, dan poligon) secara independen.
* Setiap layer data dilengkapi dengan kontrol opasitas (*slider 0-100%*) sehingga pengguna dapat menumpuk beberapa layer data sekaligus secara informatif tanpa menutupi informasi dasar di bawahnya.

### 3.3 Info Windows & Tooltip Pintar
* Ketika pengguna melakukan *hover* atau klik pada sebuah entitas objek di peta, sistem harus memunculkan pop-up *info window* dengan desain modern (menggunakan efek *shadow*, *border-radius* halus, dan tipografi bersih).
* *Info window* tidak hanya menampilkan data tekstual statis, melainkan juga harus mampu merender grafik tren mini (*sparklines*) atau ringkasan performa objek terkait yang ditarik secara *real-time* dari database.

### 3.4 Filter Data Lanjutan (Advanced Filtering)
* Menyediakan panel filter berbasis parameter non-spasial, seperti rentang waktu (*date-range picker*) dan kategori data tertentu.
* Perubahan nilai filter wajib direspons secara instan oleh canvas peta (*real-time re-rendering*) tanpa memuat ulang seluruh halaman web.

### Matriks Fitur & Prioritas
| ID Fitur | Nama Fitur | Deskripsi Teknis Singkat | Prioritas |
| :--- | :--- | :--- | :--- |
| **FR-01** | Dynamic Map Canvas | Rendering basemap dark/light mode menggunakan Vector Tiles via WebGL canvas. | **High (MVP)** |
| **FR-02** | Layer Control & Opacity | Manajemen visibilitas layer titik/garis/poligon dilengkapi dengan range slider opasitas. | **High (MVP)** |
| **FR-03** | Smart Attribute Pop-up | Render pop-up atribut interaktif saat objek spasial dipicu (click/hover event). | **High (MVP)** |
| **FR-04** | Real-time Attribute Filter | Query data dinamis berdasarkan kategori/waktu tanpa interupsi reload halaman. | **Medium** |
| **FR-05** | 3D Extrusion Building | Render otomatis poligon bangunan menjadi bentuk 3D pada level zoom ≥ 16. | **Low (Phase 2)** |

---

## 4. Rekomendasi Arsitektur Teknis & Alur Data
Untuk mencapai visualisasi yang menarik, cepat, dan responsif, arsitektur sistem disarankan menghindari rendering berat di sisi klien untuk data mentah berskala besar. Komponen tumpukan teknologi yang diajukan adalah:

1.  **Frontend Layer:** Menggunakan library map modern seperti **MapLibre GL JS** atau **Mapbox GL JS**. Framework ini mengandalkan akselerasi GPU perangkat keras klien melalui WebGL, memastikan transisi, rotasi, dan rendering ribuan objek spasial secara simultan tetap mulus. Struktur komponen UI luar menggunakan React atau Vue.js untuk efisiensi *state management*.
2.  **Backend Layer:** Node.js (Express) atau Python (FastAPI/Django) yang dioptimalkan untuk memproses data geo-komputasi. Server berfungsi sebagai penyedia API RESTful atau GraphQL yang menyuplai data ke frontend dalam bentuk terkompresi.
3.  **Database & Penyimpanan Spasial:** Menggunakan database relasional **PostgreSQL** yang dilengkapi dengan ekstensi spasial **PostGIS**. Kombinasi ini krusial untuk melakukan operasi kueri spasial kompleks seperti *indexing* spasial (R-Tree), kueri kedekatan jarak (*bounding box*), atau kalkulasi poligon langsung di level database sebelum dilempar ke client.
4.  **Format Optimasi Data:** Dataset berskala besar wajib dikonversi menjadi format **Vector Tiles (MVT)** melalui server tile seperti Tegola atau Martin, sedangkan data statis berkapasitas di bawah 5MB dapat dilayani langsung dengan format GeoJSON standar demi kemudahan *deployment* awal.

---

## 5. Spesifikasi Non-Fungsional (Non-Functional Requirements)
Aspek non-fungsional di bawah ini mengikat arsitektur agar sistem memiliki keandalan tinggi saat diakses publik:

* **Performa Kecepatan Memuat (Loading Performance):** Kecepatan muat awal peta (*First Contentful Paint*) tidak boleh melebihi batas toleransi 2.0 detik pada jaringan internet seluler 4G rata-rata. Pemuatan *chunk* data spasial baru saat melakukan pan/zoom harus selesai dalam waktu kurang dari 500ms melalui strategi *caching* sisi server yang ketat.
* **Desain Responsif (Responsive Adaptability):** Seluruh layout dasbor kontrol, legenda peta, dan panel layer harus mengimplementasikan desain responsif berbasis sistem grid fleksibel. Ketika web diakses melalui layar gawai (*smartphone*), dasbor kontrol wajib menyusut secara otomatis (*collapsible sidebar*) untuk memprioritaskan ruang pandang peta utama (*viewport maximization*).
* **Keamanan Data & Akses Spasial:** Endpoint API yang menyuplai data koordinat sensitif harus diproteksi dengan protokol autentikasi standar (JWT/OAuth2). Sistem harus memiliki kontrol akses berbasis peran (RBAC - *Role Based Access Control*) untuk memastikan data spasial internal organisasi tidak terekspos ke publik tanpa izin otorisasi yang valid.

---

## 6. Kriteria Keberhasilan & Validasi Objektif
Produk ini dinyatakan memenuhi standar rilis apabila berhasil melewati pengujian objektif berikut:

* **Pengujian Beban Canvas (Canvas Stress Test):** Peta mampu merender minimal 10.000 entitas titik koordinat acak secara bersamaan tanpa mengalami penurunan *frame rate* di bawah 45 FPS saat pengguna melakukan interaksi zoom in/out secara agresif.
* **Validasi Skema Unggah (Upload Scheme Validation):** Pengguna administrator dapat mengunggah file spasial eksternal (GeoJSON) berukuran hingga 10MB, dan sistem berhasil memetakan objek tersebut ke dalam koordinat geografis yang tepat (WGS 84 / EPSG:4326) secara otomatis dalam waktu kurang dari 3 detik tanpa galat server.
