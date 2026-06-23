# Tıpta Soru Tekrar Aracı 🩺

Tıpta Soru Tekrar Aracı, çıkmış tıp sınav sorularını (TUS, kurul sınavları, dönem finalleri) **Aralıklı Tekrar (Spaced Repetition)** ve **Akıllı Benzerlik Algoritmaları** kullanarak kalıcı hafızaya almanızı sağlayan premium tasarımlı, Flask tabanlı bir web uygulamasıdır.

---

## ✨ Özellikler

### 1. Aralıklı Tekrar Sistemi (SRS - Spaced Repetition)
* **SM-2 Algoritması:** Geliştirilmiş SuperMemo (SM-2) algoritması temel alınarak her sorunun gelecekteki tekrar tarihi otomatik planlanır.
* **11 Kademeli Puanlama:** Soruları çözdükten sonra 1-10 arası zorluk puanı verebilir ya da 11 seçeneği ile doğrudan arşivleyebilirsiniz.
* **Hatalı Soruları Sona Ekleme:** 1 (Hatırlayamadım) olarak puanlanan sorular, aktif çalışma oturumunun sonuna otomatik olarak tekrar çözülmek üzere eklenir.

### 2. Akıllı Benzerlik Testi (Similarity Check) 🔍
* **Çift Katmanlı Algoritma:** Soruları ve şıkları **Jaccard Benzerlik Katsayısı** ve **SequenceMatcher (Levenshtein benzeri)** kullanarak karşılaştırır.
* **Ön-Filtreleme & Stemming:** Türkçe kelimeleri küçük harfe çevirme (Turkish-aware casing) ve stop-words (dolgu kelimeleri) ayıklama işlemlerinden geçirerek benzer soruları gerçek zamanlı tespit eder.
* **Kademeli Gösterim:** Benzer sorular çözülmeden önce sadece başlık/benzerlik oranı görünür; soru çözüldüğü an tüm şıkları ve doğru cevabı açılarak karşılaştırma yapmanızı kolaylaştırır.

### 3. "Kesinlikle Tekrar" Özel Havuzu 📌
* **Özel Veritabanı:** Çözmekte zorlandığınız veya çok önemli bulduğunuz soruları tek tıkla özel `special_repeats` tablosuna kopyalayın.
* **Serbest Çalışma Mantığı:** Bu havuzdaki sorular aralık tarihlerine takılmadan her zaman çözülebilir durumdadır.
* **Tek Seferlik Kaldırma:** Soruyu tamamen pekiştirdiğinizi düşündüğünüzde tek tıkla sadece bu özel listeden kaldırabilirsiniz (ana havuzdaki soru korunur).

### 4. Gelişmiş Log & Geri Alma (Undo) Sistemi 🔄
* **Her İşlem Kayıt Altında:** Soru ekleme, silme, güncelleme, puanlama ve cevap anahtarı düzeltme işlemleri `action_logs.db` veritabanında saklanır.
* **1-Click Geri Alma:** Hatalı yaptığınız herhangi bir işlemi log geçmişi panelinden tek tıkla veritabanı seviyesinde geri alabilirsiniz.

### 5. Otomatik Yedekleme (Auto-Backup) 💾
* **Akıllı Yedekleme:** Her 50 soru ekleme veya puanlama sonrasında `questions.db` ve `action_logs.db` dosyalarını tarih damgalı yedekler.
* **Pruning Mekanizması:** Disk dolmasını engellemek amacıyla sadece son 100 yedeği tutar, daha eski yedekleri otomatik temizler.

---

## 🛠️ Teknoloji Yığını

* **Backend:** Python 3.x, Flask (REST API), SQLite3
* **Frontend:** Vanilla HTML5, Vanilla JavaScript (ES6+), Özel CSS3 (Karanlık Mod temalı, Glassmorphism detaylı modern tasarım)
* **Algoritmalar:** SuperMemo-2 (SRS), Jaccard (Metin Madenciliği), SequenceMatcher (Dizge Eşleme)

---

## 📦 Kurulum ve Çalıştırma

### 1. Gereksinimler
Sisteminizde Python 3'ün kurulu olduğundan emin olun.

### 2. Depoyu Klonlayın
```bash
git clone https://github.com/kullanici_adi/sorutekrarzimbirti.git
cd sorutekrarzimbirti
```

### 3. Bağımlılıkları Yükleyin
```bash
pip install -r requirements.txt
```

### 4. Uygulamayı Başlatın
Uygulamayı doğrudan çalıştırmak için terminalden şu komutu verin:
```bash
python app.py
```
Veya Windows ortamındaysanız dizindeki `run.bat` dosyasına çift tıklayarak başlatabilirsiniz.

Uygulama varsayılan olarak **`http://localhost:5000`** adresinde çalışmaya başlayacaktır. Tarayıcınızdan bu adrese giderek kullanabilirsiniz.

---

## 📂 Dizin Yapısı

```text
├── app.py                      # Flask REST API sunucusu ve rotalar
├── database.py                 # SQLite veritabanı işlemleri, yedekleme ve undo motoru
├── run.bat                     # Kolay başlatma scripti
├── requirements.txt            # Bağımlılık listesi
├── action_logs.db              # Kullanıcı işlem günlükleri (Log veri tabanı)
├── questions.db                # Sorular ve aralıklı tekrar verileri (Ana veri tabanı)
├── backups/                    # Otomatik oluşturulan veritabanı yedekleri
├── execution/
│   └── similarity_cache.py     # Benzerlik testi için kullanılan bellek ve kelime süzgeci
├── static/
│   ├── css/
│   │   └── style.css           # Premium arayüz CSS kodları
│   └── js/
│       └── app.js              # Arayüz ve istemci mantığını yöneten JS motoru
└── templates/
    └── index.html              # Tek sayfa (SPA) HTML yapısı
```

---

## 💡 Kullanım İpuçları

* **Cevap Anahtarı Düzeltme:** Bir sorunun cevabını yanlış girdiyseniz, soru çözüm ekranındaki "Cevap Anahtarı Yanlış 🛠️" butonuna basarak doğru şıkkı güncelleyebilirsiniz. Bu işlem hem veritabanında hem de eğer soru kurul/final json dosyalarından geliyorsa ilgili json dosyasında otomatik düzeltilir.
* **Benzerlik Eşiği Ayarı:** Sidebar (sol menü) altındaki kaydırıcı ile benzerlik hassasiyetini (varsayılan %70) değiştirebilirsiniz.
* **Klavye Kısayolları:**
  * Seçenekler için: `A`, `B`, `C`, `D`, `E` tuşları.
  * Zorluk puanları için: `1` - `0` tuşları (`0` = 10 puanını temsil eder).
  * Arşivlemek için: `p` tuşu (11 puanını temsil eder).
