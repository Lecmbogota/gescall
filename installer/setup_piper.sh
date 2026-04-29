#!/bin/bash
set -e

# Configuration
PIPER_VERSION="2023.11.14-2"
PIPER_ARCH="linux_amd64" # Adjust based on system architecture if needed
INSTALL_DIR="/opt/piper"
VOICE_MODEL="es_ES-sharvard-medium"
VOICE_URL_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/sharvard/medium"

echo "============================================"
echo "Installing Piper TTS..."
echo "============================================"

# Ensure install directory exists
mkdir -p "$INSTALL_DIR"

# Download Piper
echo "Downloading Piper..."
cd /tmp
wget -O piper.tar.gz "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/piper_${PIPER_ARCH}.tar.gz"

# Extract
echo "Extracting..."
tar -xf piper.tar.gz
cp -r piper/* "$INSTALL_DIR/"
rm -rf piper piper.tar.gz

# Download Voice Model
echo "Downloading Voice Model ($VOICE_MODEL)..."
cd "$INSTALL_DIR"
wget -O "${VOICE_MODEL}.onnx" "${VOICE_URL_BASE}/${VOICE_MODEL}.onnx"
wget -O "${VOICE_MODEL}.onnx.json" "${VOICE_URL_BASE}/${VOICE_MODEL}.onnx.json"

# Create Executable Wrapper
echo "Creating global wrapper..."
cat << EOF > /usr/local/bin/piper-tts
#!/bin/bash
echo "\$1" | $INSTALL_DIR/piper --model $INSTALL_DIR/${VOICE_MODEL}.onnx --output_file \$2
EOF

chmod +x /usr/local/bin/piper-tts

echo "============================================"
echo "Piper TTS Installed Successfully!"
echo "Usage: piper-tts 'Texto a hablar' output.wav"
echo "============================================"
