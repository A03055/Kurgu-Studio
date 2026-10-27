# 🎬 Kurgu Studio

**Ücretsiz, reklamsız, filigransız video düzenleyici.** Abonelik yok, hesap yok, sınır yok.
Dosyaların bilgisayarından hiç çıkmaz; her şey senin makinende işlenir.

## İndir (Windows .exe)

1. Bu depoda **Actions** sekmesine gir → **"Windows .exe derle"** → en son başarılı (yeşil ✓) çalışmayı aç.
2. Sayfanın altındaki **Artifacts** bölümünden `KurguStudio-Windows` dosyasını indir ve zipten çıkar.
3. İçinden iki dosya çıkar:
   - `KurguStudio-Kurulum-1.0.0.exe`: bilgisayara kurar, masaüstüne kısayol ekler.
   - `KurguStudio-Tasinabilir-1.0.0.exe`: kurulum gerektirmez, çift tıkla aç (USB bellekte de çalışır).

> İmzasız uygulama olduğu için Windows ilk açılışta "Windows bilgisayarınızı korudu" uyarısı gösterebilir.
> **Ek bilgi → Yine de çalıştır** demen yeterli.

`v1.0.0` gibi bir etiket (tag) gönderildiğinde dosyalar otomatik olarak **Releases** sayfasında da yayınlanır.

### Kurulum olmadan, tarayıcıda

`index.html` dosyasını Chrome ya da Edge ile açman yeterli. Ya da depo ayarlarından
**Settings → Pages → Deploy from branch** seçerek internetten erişilebilir bir adres alabilirsin.

## Özellikler

| | |
|---|---|
| ✂️ **Düzenleme** | Çok izli zaman çizelgesi, sürükle-bırak, kırp, böl (S), çoğalt, boşluk bırakmadan sil, kare dondur, sesi ayır, geri al / yinele, yapışma (snap) |
| 🔀 **20 geçiş** | Çözülme, siyaha/beyaza geçiş, kaydırma (4 yön), silme, perde, daire, elmas, yakınlaş/uzaklaş, döndür, bulanık, glitch, piksel, bölünme, jaluzi |
| ✨ **30 efekt** | VHS, eski film, film greni, glitch, RGB kayma, sarsıntı, ritim zoom, flaş, stroboskop, ışık sızması, parıltı, gökkuşağı, kar, yağmur, konfeti, kalpler, yıldızlar, baloncuk, pikselleştir, ayna, dörtlü ayna, rüya, polaroid çerçeve, kamera REC, sinema şeridi, vinyet… |
| 🎨 **14 filtre ve ayarlar** | Canlı, sıcak, soğuk, siyah-beyaz, noir, vintage, sinematik, dramatik, pastel, gün batımı, siber… Parlaklık, kontrast, doygunluk, ton, sıcaklık, bulanıklık |
| 🔤 **Metin** | 12 hazır şablon (başlık, altyazı, neon, abone ol…), 8 yazı tipi, kontur, gölge/parlama, arka plan kutusu, daktilo efekti |
| 😀 **Çıkartmalar** | 120+ emoji çıkartması, animasyonlu |
| 🎞️ **Animasyon** | 11 giriş, 10 çıkış, 9 sürekli animasyon (Ken Burns yakınlaşma, nabız, sallanma, süzülme…), fade in/out |
| 🎵 **Telifsiz müzik ve sesler** | 6 müzik (Lo-fi, Pop, Piyano, Synthwave, Gerilim, Mutlu) ve 14 ses efekti (vuuş, pop, ding, bum, yükseliş, deklanşör…). Hepsi program içinde üretilir; YouTube, TikTok ve Instagram'da gönül rahatlığıyla kullanılabilir |
| ⚡ **Hız ve ses** | 0.25x – 4x hız, %0 – %200 ses, ses açılıp kısılması |
| 📐 **Formatlar** | 16:9 YouTube, 9:16 TikTok/Reels, 1:1, 4:5 Instagram, 4:3, 21:9. Dikey videolar için bulanık arka plan |
| 🖼️ **Önizlemede düzenleme** | Klibi doğrudan önizlemede sürükle, köşeden büyüt, üstteki tutamaçtan döndür, tekerlekle ölçekle |
| 💾 **Otomatik kayıt** | Proje ve medya otomatik kaydedilir; programı kapatıp açınca kaldığın yerden devam |
| 📤 **Dışa aktarma** | 480p'den 4K'ya, 24/30/60 fps, MP4 (ya da WebM). Filigran yok |

## Kısayollar

| Tuş | İşlev |
|---|---|
| Boşluk | Oynat / durdur |
| S veya Ctrl+B | Oynatma çizgisinden böl |
| Delete / Shift+Delete | Sil / boşluk bırakmadan sil |
| Ctrl+Z / Ctrl+Y | Geri al / yinele |
| Ctrl+D | Çoğalt |
| ← / → (Shift ile 1 sn) | Kare kare ilerle |
| Ctrl + fare tekerleği | Zaman çizelgesini yakınlaştır |
| Sağ tık | Klip menüsü |
| F11 | Tam ekran (masaüstü sürümü) |

## Geliştirici notları

Saf HTML/CSS/JavaScript; derleme adımı yok. Masaüstü sürümü Electron ile paketlenir.

```bash
npm install
npm start          # masaüstü uygulamasını aç
npm run dist       # Windows için .exe üret (Windows'ta çalıştır)
```

```
index.html        arayüz
css/style.css     tasarım
js/state.js       proje modeli, geri al, otomatik kayıt
js/render.js      oynatma motoru, geçişler, efektler
js/timeline.js    zaman çizelgesi
js/inspector.js   sağ ayar paneli
js/panels.js      sol içerik paneli
js/library.js     geçiş, efekt, filtre, metin, müzik ve ses efekti kütüphanesi
js/media.js       içe aktarma, küçük resim, ses dalgası
js/export.js      dışa aktarma
electron/main.js  masaüstü penceresi
```

Lisans: MIT. Özgürce kullan, paylaş, geliştir.
