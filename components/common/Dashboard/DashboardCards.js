/**
 * DashboardCards - Action cards (Ny kontroll, Dagens uppgifter)
 */

import React from 'react';
import { Image, Platform, TouchableOpacity, View } from 'react-native';

const DashboardCards = ({
  dashboardBtn1Url,
  dashboardBtn2Url,
  dashboardBtn1Failed,
  dashboardBtn2Failed,
  onButton1Press,
  onButton2Press,
  onButton1Error,
  onButton2Error,
}) => {
  const cardStyle = {
    borderRadius: 14,
    overflow: 'hidden',
    width: 380,
    height: 180,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    ...(Platform.OS === 'web' ? {
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'pointer',
    } : {}),
  };

  const handleMouseEnter = (e) => {
    if (Platform.OS !== 'web') return;
    try {
      const target = e?.currentTarget;
      if (target) {
        target.style.transform = 'scale(1.02)';
        target.style.boxShadow = '0px 8px 16px rgba(0,0,0,0.15)';
      }
    } catch (_e) {}
  };

  const handleMouseLeave = (e) => {
    if (Platform.OS !== 'web') return;
    try {
      const target = e?.currentTarget;
      if (target) {
        target.style.transform = 'scale(1)';
        target.style.boxShadow = '0px 4px 8px rgba(0,0,0,0.1)';
      }
    } catch (_e) {}
  };

  return (
    <View style={{ marginBottom: 14, marginTop: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, flexWrap: 'wrap' }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onButton1Press || (() => { console.log('Dashboard button 1 clicked'); })}
          style={cardStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Image
            source={dashboardBtn1Url && !dashboardBtn1Failed ? { uri: dashboardBtn1Url } : require('../../../assets/images/partial-react-logo.png')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onError={() => { try { if (onButton1Error) onButton1Error(true); } catch (_e) {} }}
            onLoad={() => { try { if (onButton1Error) onButton1Error(false); } catch (_e) {} }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onButton2Press || (() => { console.log('Dashboard button 2 clicked'); })}
          style={cardStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Image
            source={dashboardBtn2Url && !dashboardBtn2Failed ? { uri: dashboardBtn2Url } : require('../../../assets/images/partial-react-logo.png')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onError={() => { try { if (onButton2Error) onButton2Error(true); } catch (_e) {} }}
            onLoad={() => { try { if (onButton2Error) onButton2Error(false); } catch (_e) {} }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default DashboardCards;
