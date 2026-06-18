#!/bin/bash
echo "=== Soru Tekrar Aracı Termux Kurulumu ==="

# 1. Paket güncellemesi ve python kurulumu
pkg update -y
pkg install -y python python-pip sqlite

# 2. Gerekli kütüphanenin kurulumu
pip install flask

# 3. Gizli canlı uygulama klasörünü oluşturma
DEPLOY_DIR="$HOME/.soru_tekrar_app"
mkdir -p "$DEPLOY_DIR"

# 4. Python kodlarını bytecode (.pyc) formatına derleme
# -b bayrağı ile .pyc dosyaları doğrudan ana klasörde oluşturulur.
python -m compileall -b .

# 5. Derlenmiş bytecode dosyalarını ve arayüz klasörlerini kopyalama
cp app.pyc "$DEPLOY_DIR/"
cp database.pyc "$DEPLOY_DIR/"
cp -r templates "$DEPLOY_DIR/"
cp -r static "$DEPLOY_DIR/"
cp -r "kurul soruları json format" "$DEPLOY_DIR/"
cp -r "final soruları json format" "$DEPLOY_DIR/"

# 6. Ana dizinde çalıştırma kısayolu (baslat.sh) oluşturma
LAUNCHER="$HOME/baslat.sh"
cat << 'EOF' > "$LAUNCHER"
#!/bin/bash
cd "$HOME/.soru_tekrar_app"
python app.pyc
EOF
chmod +x "$LAUNCHER"

# 7. Geçici yükleme klasörünü arka planda güvenli bir şekilde silme
echo "Kurulum bitti. Kaynak kodlar temizleniyor..."
cd "$HOME"
(sleep 1 && rm -rf "$HOME/gecici_soru_tekrar") &

echo "================================================"
echo "Kurulum başarıyla tamamlandı!"
echo "Arkadaşınız uygulamayı başlatmak için sadece şunu yazmalıdır:"
echo "  ./baslat.sh"
echo ""
echo "Uygulamaya tarayıcıdan şu adresten erişebilir:"
echo "  http://localhost:5000"
echo "================================================"
