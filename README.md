# Akış Trafik Simülatörü

Büyük şehir yollarında trafiğin neden sıkıştığını ve nasıl açılabileceğini gösteren, tarayıcıda çalışan bir simülasyon.

Aynı araçlar, aynı sırayla iki yola giriyor:

- **Mevcut:** Bugünkü alışkanlıklar. Sol şeritte yavaş gidenler, son anda şerit kesenler, zorla araya girenler.
- **Önerilen:** Hıza göre şerit (sağ 50, orta 70, sol 90), sağa dönüş cebi, fermuar birleşme, değişken hız limiti ve rampa ışığı.

Sonuçlar yan yana karşılaştırılıyor: yolculuk süresi, ortalama hız, geçen araç sayısı, sert fren sayısı, duran araç sayısı.

## Özellikler

- **16 hazır senaryo:** Büyük koridor, köprülü kavşak, kaza, arıza, yol çalışması, daralma, yağmur, kar, sis, hayalet sıkışma. Yol tipi, olay ve havaya göre filtrelenebiliyor.
- **Olay ekleme:** Kaza, arızalı araç, yol çalışması, ani fren, sağanak ve yoğunluk dalgası. Her olay iki yola aynı anda ve aynı noktada eklenir.
- **Çözümler tek tek:** Önerilen düzendeki her önlem ayrı ayrı açılıp kapatılabiliyor. Böylece hangi önlemin ne kazandırdığı görülebiliyor.
- **Hava koşulları:** Hız, takip mesafesi ve fren gücü havaya göre değişiyor.
- **Her ekranda çalışır:** Telefonda yol dikey, bilgisayarda yatay çiziliyor. Açık ve koyu tema destekleniyor.

## Çalıştırma

Kurulum gerekmez. `index.html` dosyasını tarayıcıda açman yeterli.

Kaynak dosyaları değiştirdikten sonra tek dosyayı yeniden oluşturmak için:

```bash
python3 build.py
```

Motoru tarayıcı olmadan denemek için (Node.js gerekir):

```bash
node tests/koridor.js
```

## Klasör yapısı

```
src/engine.js   Trafik motoru: araç takibi, şerit değiştirme, olaylar, rampa ışığı
src/app.js      Arayüz: çizim, senaryolar, istatistikler, ayarlar
src/app.html    Sayfa iskeleti ve stiller
build.py        Üç dosyayı tek bir index.html dosyasında birleştirir
tests/          Motorun komut satırından denenmesi
```

## Model nasıl çalışıyor?

Her araç, trafik araştırmalarında yaygın kullanılan **Akıllı Sürücü Modeli (IDM)** ile hızlanıp yavaşlıyor. Şerit değiştirme kararı MOBIL modeline benzer bir mantıkla veriliyor: "Bana kazanç var mı, arkadakini sert frene zorluyor muyum?"

Sayılar eğilimleri gösterir, ölçülmüş bir şehir verisi değildir. Gerçek bir yol için karar vermeden önce model o yolun sayım verileriyle ayarlanmalıdır.

Kaza ve daralma senaryolarında önerilen düzen yolculuk süresini her zaman kısaltmıyor, ama sert frenleri belirgin şekilde azaltıyor. Büyük koridorda önlemler tek tek açıldığında etkileri sınırlı kalıyor, hepsi birlikte açıldığında akış belirgin şekilde iyileşiyor.

---

Ahmet Furkan Göktaş
