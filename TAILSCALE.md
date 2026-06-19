# Tailscale ile Uzaktan Güvenli Erişim Kılavuzu 🩺

Bu kılavuz, evinizdeki/bilgisayarınızdaki **Soru Tekrar Aracı v2** uygulamasına dışarıdayken (mobilde, kütüphanede veya başka bir internet ağındayken) şifreli, güvenli ve tamamen ücretsiz bir şekilde nasıl erişebileceğinizi adım adım açıklar.

---

## 1. Tailscale Nedir?
[Tailscale](https://tailscale.com), cihazlarınız (bilgisayarınız, telefonunuz, tabletiniz vb.) arasında modemden port açmanıza gerek kalmadan şifreli sanal bir özel ağ (Mesh VPN) kurar. Bu sayede uygulamanız internete açık hale gelmez (güvenlidir) ve sadece sizin cihazlarınız birbirini görebilir.

---

## 2. Kurulum Adımları

### Adım 1: Ana Bilgisayara Kurulum (Uygulamanın Çalıştığı Yer)
1. Resmi web sitesinden **[Tailscale Ücretsiz Kayıt](https://login.tailscale.com/start)** sayfasına gidin ve bir hesap oluşturun (Google, Microsoft veya Github hesabınızı kullanabilirsiniz).
2. **[Windows için Tailscale](https://tailscale.com/download/windows)** istemcisini indirip bilgisayarınıza kurun.
3. Sağ altta bildirim alanında beliren Tailscale simgesine tıklayarak **Log in...** deyin ve oluşturduğunuz hesapla giriş yapın.
4. Başarıyla bağlandığınızda simgeye sağ tıklayarak `100.x.y.z` formatındaki özel IP adresinizi görebilirsiniz.

### Adım 2: Telefona, Tablete veya Uzaktaki Cihaza Kurulum
1. Telefonunuzun uygulama mağazasından (Google Play Store veya Apple App Store) **Tailscale** uygulamasını indirin.
2. Uygulamayı açın ve **bilgisayarınızda kullandığınız aynı hesapla** giriş yapın.
3. Uygulamanın istediği VPN yapılandırma iznine onay verin.
4. Üstteki anahtarı **Active / Connect** konumuna getirin.

---

## 3. Uzaktan Erişim ve Kullanım

1. Ana bilgisayarınızda tıp soru tekrar aracını başlatın (örn: `run.bat` dosyasına çift tıklayarak veya terminalden `python app.py` yazarak).
2. Sunucu başladığında terminal ekranında otomatik olarak Tailscale IP adresiniz algılanacak ve şu şekilde yazacaktır:
   ```text
   ======================================================================
     🩺 TIPTA SORU TEKRAR ARACI BAŞLATILIYOR...
     Yerel Erişim Adresi:   http://localhost:5000
     Tailscale Uzaktan Erişim Adresi: http://100.x.y.z:5000
   ======================================================================
   ```
3. Telefonunuzun veya uzaktaki cihazınızın tarayıcısına gidip **`http://100.x.y.z:5000`** adresini (kendi IP adresinizle) yazın.
4. Artık uygulamanıza dünyanın her yerinden şifreli ve güvenli bir şekilde erişebilirsiniz!

---

## ⚠️ Önemli Güvenlik Notları
* **İnternet Bağımsızlığı:** Bilgisayarınızın ev internetine bağlı olması, telefonunuzun ise hücresel veri (4G/5G) veya başka bir Wi-Fi ağına bağlı olması fark etmez. Tailscale tüneli sayesinde bağlantı kurulacaktır.
* **Cihaz Güvenliği:** Yalnızca sizin hesabınızla giriş yapılmış ve Tailscale ağı aktif edilmiş cihazlar bu adrese erişebilir. İnternetteki diğer üçüncü şahıslar veya tarayıcı botları bu IP adresini kullanarak uygulamanıza kesinlikle erişemez.
* **Sunucu Durumu:** Uzaktan erişim sağlayabilmeniz için ana bilgisayarınızın açık, internete bağlı ve Tailscale uygulamasının aktif olması gerekmektedir.
