import React, { useRef, useState, useEffect } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Pressable,
  Alert, Image, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import { t } from '@/lib/i18n';

export const SIGNATURE_STORAGE_KEY = '@solvymed/signature';

export async function loadSignature(): Promise<string | null> {
  try { return await AsyncStorage.getItem(SIGNATURE_STORAGE_KEY); }
  catch { return null; }
}

export async function saveSignature(base64: string): Promise<void> {
  await AsyncStorage.setItem(SIGNATURE_STORAGE_KEY, base64);
}

export async function clearSignature(): Promise<void> {
  await AsyncStorage.removeItem(SIGNATURE_STORAGE_KEY);
}

const CANVAS_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #FFFFFF; overflow: hidden; }
  canvas { display: block; cursor: crosshair; touch-action: none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
  const c = document.getElementById('c');
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#1A2138';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let drawing = false, lastX = 0, lastY = 0, hasDrawn = false;

  function pos(e) {
    const t = e.touches ? e.touches[0] : e;
    const r = c.getBoundingClientRect();
    return [t.clientX - r.left, t.clientY - r.top];
  }

  c.addEventListener('touchstart', e => {
    e.preventDefault();
    const [x, y] = pos(e);
    drawing = true; lastX = x; lastY = y;
    ctx.beginPath(); ctx.arc(x, y, 1.25, 0, Math.PI * 2);
    ctx.fillStyle = '#1A2138'; ctx.fill();
  }, { passive: false });

  c.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!drawing) return;
    const [x, y] = pos(e);
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(x, y); ctx.stroke();
    lastX = x; lastY = y; hasDrawn = true;
  }, { passive: false });

  c.addEventListener('touchend', e => { e.preventDefault(); drawing = false; }, { passive: false });

  window.clearPad = function() {
    ctx.clearRect(0, 0, c.width, c.height);
    hasDrawn = false;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'cleared' }));
  };

  window.savePad = function() {
    if (!hasDrawn) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'empty' }));
      return;
    }
    // Trim whitespace
    const d = ctx.getImageData(0, 0, c.width, c.height);
    let x1 = c.width, y1 = c.height, x2 = 0, y2 = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d.data[(y * c.width + x) * 4 + 3] > 0) {
          if (x < x1) x1 = x; if (x > x2) x2 = x;
          if (y < y1) y1 = y; if (y > y2) y2 = y;
        }
      }
    }
    const pad = 12, w = x2 - x1 + pad * 2, h = y2 - y1 + pad * 2;
    const tc = document.createElement('canvas');
    tc.width = w; tc.height = h;
    tc.getContext('2d').drawImage(c, x1 - pad, y1 - pad, w, h, 0, 0, w, h);
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'signature', data: tc.toDataURL('image/png') }));
  };
</script>
</body>
</html>`;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function SignatureSetupModal({ visible, onClose, onSaved }: Props) {
  const webRef = useRef<WebView>(null);
  const [existingSignature, setExistingSignature] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasCanvas, setHasCanvas] = useState(false);

  useEffect(() => {
    if (!visible) return;
    loadSignature().then(sig => { setExistingSignature(sig); setLoading(false); setHasCanvas(false); });
  }, [visible]);

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'empty') {
        Alert.alert('', t('settings.signature.drawFirst' as any));
      } else if (msg.type === 'signature') {
        saveSignature(msg.data).then(() => {
          setExistingSignature(msg.data);
          setHasCanvas(false);
          Alert.alert('', t('settings.signature.saved' as any));
          onSaved();
        });
      } else if (msg.type === 'cleared') {
        setHasCanvas(false);
      }
    } catch {}
  }

  function handleClearExisting() {
    Alert.alert(t('settings.signature.clear' as any), t('settings.signature.clearConfirm' as any), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => { clearSignature(); setExistingSignature(null); onSaved(); },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('settings.signature' as any)}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator style={{ margin: 40 }} color={Colors.primary} />
        ) : !hasCanvas && existingSignature ? (
          /* Show saved signature preview */
          <View style={styles.previewContainer}>
            <Text style={styles.hint}>{t('settings.signature.current' as any)}</Text>
            <View style={styles.previewBox}>
              <Image source={{ uri: existingSignature }} style={styles.previewImg} resizeMode="contain" />
            </View>
            <View style={styles.previewActions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setHasCanvas(true)}>
                <Ionicons name="pencil-outline" size={16} color={Colors.primary} />
                <Text style={styles.secondaryBtnText}>{t('settings.signature.redraw' as any)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerBtn} onPress={handleClearExisting}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                <Text style={styles.dangerBtnText}>{t('settings.signature.clear' as any)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Signature canvas */
          <>
            <Text style={styles.hint}>{t('settings.signature.hint' as any)}</Text>
            <View style={styles.canvasContainer}>
              <WebView
                ref={webRef}
                source={{ html: CANVAS_HTML }}
                style={styles.canvas}
                scrollEnabled={false}
                onMessage={handleMessage}
                onLoadEnd={() => setHasCanvas(true)}
                javaScriptEnabled
                domStorageEnabled
              />
            </View>
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => webRef.current?.injectJavaScript('window.clearPad(); true;')}
              >
                <Ionicons name="refresh-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.clearBtnText}>{t('settings.signature.clear' as any)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => webRef.current?.injectJavaScript('window.savePad(); true;')}
              >
                <Text style={styles.saveBtnText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  hint: { fontSize: 12, color: Colors.textMuted, marginHorizontal: 20, marginTop: 12, marginBottom: 8 },
  canvasContainer: {
    marginHorizontal: 16, height: 200,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12,
    overflow: 'hidden', backgroundColor: '#fff',
  },
  canvas: { flex: 1, backgroundColor: 'transparent' },
  btnRow: {
    flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 14,
  },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
    borderColor: Colors.border, justifyContent: 'center', backgroundColor: Colors.background,
  },
  clearBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  previewContainer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  previewBox: {
    height: 120, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginVertical: 12,
  },
  previewImg: { width: '100%', height: '100%' },
  previewActions: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary,
  },
  secondaryBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  dangerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.danger,
  },
  dangerBtnText: { fontSize: 14, color: Colors.danger, fontWeight: '600' },
});
