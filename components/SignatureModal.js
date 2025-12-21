
import { useRef } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import SignatureScreen from 'react-native-signature-canvas';

export default function SignatureModal({ visible, onOK, onCancel }) {
  const signRef = useRef();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, width: 340 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Skriv signatur</Text>
          <Text style={{ fontSize: 15, color: '#888', marginBottom: 8, textAlign: 'center' }}>Signera med fingret</Text>
          <View style={{ height: 220, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            <SignatureScreen
              ref={signRef}
              onOK={onOK}
              onEmpty={() => {}}
              penColor="#222"
              minWidth={1}
              maxWidth={2}
              webStyle={
                `.m-signature-pad--footer {display: none;} .m-signature-pad--body {touch-action: none;} .m-signature-pad {background: #fff;} .m-signature-pad--body canvas {background: #fff;}`
              }
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 24 }}>
            <TouchableOpacity onPress={() => signRef.current && signRef.current.clearSignature()}>
              <Text style={{ color: '#FFA726', fontSize: 16 }}>Nollställ</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => signRef.current && signRef.current.readSignature()}>
              <Text style={{ color: '#388E3C', fontSize: 16 }}>Spara</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCancel}>
              <Text style={{ color: '#D32F2F', fontSize: 16 }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
