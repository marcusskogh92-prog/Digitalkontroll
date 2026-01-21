import { Animated, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

export function HeaderSearchDropdown({
  headerProjectQuery,
  headerSearchOpen,
  headerSearchBottom,
  headerSearchLeft,
  headerSearchWidth,
  headerProjectMatches,
  hoveredProjectId,
  setHoveredProjectId,
  dropdownAnim,
  navigation,
  requestProjectSwitch,
  createPortal,
  portalRootId,
}) {
  if (!headerProjectQuery || !headerSearchOpen) {
    return null;
  }

  const innerDropdown = (
    <View
      style={{
        pointerEvents: 'auto',
        position: Platform.OS === 'web' ? 'fixed' : 'absolute',
        top: Platform.OS === 'web' ? headerSearchBottom : 8,
        left: Platform.OS === 'web' && headerSearchLeft !== null ? headerSearchLeft : 0,
        zIndex: 99999,
        alignItems: 'flex-start',
        marginTop: 0,
        paddingTop: 0,
      }}
   >
      <Animated.View
        style={{
          width: headerSearchWidth || 560,
          backgroundColor: '#fff',
          borderRadius: 16,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          overflow: 'hidden',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderBottomWidth: 1,
          borderTopWidth: 0,
          borderColor: '#666',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.18,
          shadowRadius: 14,
          elevation: 10,
          marginTop: 0,
          paddingTop: 0,
          opacity: Platform.OS === 'web' ? dropdownAnim : 1,
          transform:
            Platform.OS === 'web'
              ? [
                  {
                    scale: dropdownAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.995, 1],
                    }),
                  },
                ]
              : undefined,
        }}
      >
        <ScrollView
          style={{ maxHeight: 320 }}
          contentContainerStyle={{ paddingTop: 0 }}
          keyboardShouldPersistTaps="handled"
        >
          {headerProjectMatches.map(proj => (
            <TouchableOpacity
              key={proj.id}
              onMouseEnter={Platform.OS === 'web' ? () => setHoveredProjectId(proj.id) : undefined}
              onMouseLeave={Platform.OS === 'web' ? () => setHoveredProjectId(null) : undefined}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderBottomWidth: 1,
                borderColor: '#f0f0f0',
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor:
                  Platform.OS === 'web' && hoveredProjectId === proj.id ? '#F7FBFF' : '#fff',
              }}
              activeOpacity={0.8}
              onPress={() => {
                if (Platform.OS === 'web') {
                  try {
                    navigation?.setParams?.({
                      headerSearchOpen: false,
                      headerSearchKeepConnected: false,
                    });
                  } catch (_e) {}
                }
                requestProjectSwitch(proj, { selectedAction: null });
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor:
                    (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047',
                  marginRight: 10,
                  borderWidth: 1,
                  borderColor: '#bbb',
                }}
              />
              <Text
                style={{ fontSize: 15, color: '#222', fontWeight: '600', flexShrink: 1 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {proj.id} - {proj.name}
              </Text>
            </TouchableOpacity>
          ))}

          {headerProjectMatches.length === 0 ? (
            <Text
              style={{
                color: '#888',
                fontSize: 15,
                textAlign: 'center',
                paddingVertical: 14,
              }}
            >
              Inga projekt hittades.
            </Text>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );

  const PortalContent = (
    <>
      <View
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => {
          if (Platform.OS === 'web') {
            try {
              navigation?.setParams?.({
                headerSearchOpen: false,
                headerSearchKeepConnected: false,
              });
            } catch (_e) {}
          }
        }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99998,
          backgroundColor: 'rgba(0,0,0,0)',
        }}
      />
      {innerDropdown}
    </>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined') {
    try {
      let portalRoot = document.getElementById(portalRootId);
      if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = portalRootId;
        portalRoot.style.position = 'relative';
        document.body.appendChild(portalRoot);
      }
      return createPortal(PortalContent, portalRoot);
    } catch (_e) {
      return PortalContent;
    }
  }

  return innerDropdown;
}
