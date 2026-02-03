import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

export const LEFT_NAV_MICRO = {
  chevronDurationMs: 160,
  iconPulseDurationMs: 160,
  iconPulseScale: 1.03,
  webEasing: 'ease-out',
};

function useNativeDriver() {
  // RN-web has limited native driver support and can warn.
  return !(Platform && Platform.OS === 'web');
}

export function AnimatedChevron({
  expanded,
  size = 16,
  color = '#666',
  outline = false,
  rotationDeg = 90,
  spinTrigger,
  spinDeg = 360,
  durationMs = LEFT_NAV_MICRO.chevronDurationMs,
  style,
}) {
  const name = outline ? 'chevron-forward-outline' : 'chevron-forward';

  const baseAngle = expanded ? Number(rotationDeg) || 0 : 0;
  const spinCount = Number.isFinite(Number(spinTrigger)) ? Number(spinTrigger) : 0;
  const spinAngle = spinCount > 0 ? spinCount * (Number(spinDeg) || 360) : 0;
  const angle = baseAngle + spinAngle;

  // Use Animated on all platforms (including web).
  // CSS transitions on web interpolate matrices; 360° deltas can collapse to “no-op”.
  const animDeg = React.useRef(new Animated.Value(angle)).current;
  React.useEffect(() => {
    Animated.timing(animDeg, {
      toValue: angle,
      duration: durationMs,
      easing: Easing.out(Easing.ease),
      useNativeDriver: useNativeDriver(),
    }).start();
  }, [animDeg, angle, durationMs]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              rotate: animDeg.interpolate({
                inputRange: [-1000000, 1000000],
                outputRange: ['-1000000deg', '1000000deg'],
              }),
            },
          ],
        },
      ]}
    >
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

export function MicroPulse({
  trigger,
  durationMs = LEFT_NAV_MICRO.iconPulseDurationMs,
  scaleTo = LEFT_NAV_MICRO.iconPulseScale,
  style,
  children,
}) {
  if (Platform.OS === 'web') {
    const [pulsing, setPulsing] = React.useState(false);
    const timeoutRef = React.useRef(null);

    React.useEffect(() => {
      if (!Number.isFinite(Number(trigger)) || Number(trigger) <= 0) return;
      setPulsing(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setPulsing(false), Math.max(60, durationMs));
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, [trigger, durationMs]);

    return (
      <View
        style={[
          style,
          {
            transform: [{ scale: pulsing ? scaleTo : 1 }],
            transitionProperty: 'transform',
            transitionDuration: `${durationMs}ms`,
            transitionTimingFunction: LEFT_NAV_MICRO.webEasing,
          },
        ]}
      >
        {children}
      </View>
    );
  }

  const anim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (!Number.isFinite(Number(trigger)) || Number(trigger) <= 0) return;
    anim.stopAnimation();
    anim.setValue(1);
    Animated.sequence([
      Animated.timing(anim, {
        toValue: scaleTo,
        duration: Math.max(60, Math.round(durationMs * 0.5)),
        easing: Easing.out(Easing.ease),
        useNativeDriver: useNativeDriver(),
      }),
      Animated.timing(anim, {
        toValue: 1,
        duration: Math.max(60, Math.round(durationMs * 0.5)),
        easing: Easing.out(Easing.ease),
        useNativeDriver: useNativeDriver(),
      }),
    ]).start();
  }, [trigger, anim, durationMs, scaleTo]);

  return (
    <Animated.View style={[style, { transform: [{ scale: anim }] }]}>
      {children}
    </Animated.View>
  );
}

export function MicroShake({
  trigger,
  durationMs = 260,
  amplitude = 4,
  style,
  children,
}) {
  const anim = React.useRef(new Animated.Value(0)).current;
  const didMountRef = React.useRef(false);
  const lastTriggerRef = React.useRef(trigger);

  React.useEffect(() => {
    const t = Number(trigger);
    if (!didMountRef.current) {
      didMountRef.current = true;
      lastTriggerRef.current = t;
      return;
    }

    if (!Number.isFinite(t) || t <= 0) {
      lastTriggerRef.current = t;
      return;
    }

    if (t === Number(lastTriggerRef.current)) return;
    lastTriggerRef.current = t;

    anim.stopAnimation();
    anim.setValue(0);

    const a = Math.max(1, Number(amplitude) || 4);
    const step = Math.max(40, Math.round(durationMs / 6));
    Animated.sequence([
      Animated.timing(anim, { toValue: -a, duration: step, easing: Easing.linear, useNativeDriver: useNativeDriver() }),
      Animated.timing(anim, { toValue: a, duration: step, easing: Easing.linear, useNativeDriver: useNativeDriver() }),
      Animated.timing(anim, { toValue: -a * 0.75, duration: step, easing: Easing.linear, useNativeDriver: useNativeDriver() }),
      Animated.timing(anim, { toValue: a * 0.75, duration: step, easing: Easing.linear, useNativeDriver: useNativeDriver() }),
      Animated.timing(anim, { toValue: -a * 0.5, duration: step, easing: Easing.linear, useNativeDriver: useNativeDriver() }),
      Animated.timing(anim, { toValue: 0, duration: step, easing: Easing.out(Easing.ease), useNativeDriver: useNativeDriver() }),
    ]).start();
  }, [trigger, anim, durationMs, amplitude]);

  return (
    <Animated.View style={[style, { transform: [{ translateX: anim }] }]}>
      {children}
    </Animated.View>
  );
}
