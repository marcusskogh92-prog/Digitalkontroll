import React from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, meta: null };
  }

  componentDidMount() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    this._handleWindowError = (event) => {
      try {
        const err = event?.error;
        const meta = {
          type: 'window.error',
          message: event?.message,
          filename: event?.filename,
          lineno: event?.lineno,
          colno: event?.colno,
        };
        const errorToShow = err || new Error(String(meta.message || 'Uncaught error'));
        this.setState({ error: errorToShow, info: null, meta });
         
        console.error('[window.onerror]', err || meta);
      } catch {}
    };

    this._handleUnhandledRejection = (event) => {
      try {
        const reason = event?.reason;
        const err = reason instanceof Error ? reason : new Error(String(reason ?? 'Unhandled promise rejection'));
        const meta = { type: 'unhandledrejection', reason: String(reason ?? '') };
        this.setState({ error: err, info: null, meta });
         
        console.error('[unhandledrejection]', err);
      } catch {}
    };

    window.addEventListener('error', this._handleWindowError);
    window.addEventListener('unhandledrejection', this._handleUnhandledRejection);
  }

  componentWillUnmount() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (this._handleWindowError) window.removeEventListener('error', this._handleWindowError);
    if (this._handleUnhandledRejection) window.removeEventListener('unhandledrejection', this._handleUnhandledRejection);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info, meta: { type: 'react.errorboundary' } });
    try {
       
      console.error('[ErrorBoundary]', error, info);
    } catch {}
  }

  render() {
    const { error, info, meta } = this.state;
    if (!error) return this.props.children;

    const message = String(error?.message || error);
    const stack = String(info?.componentStack || error?.stack || '').trim();

    return (
      <View style={{ flex: 1, padding: 18, justifyContent: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#D32F2F', marginBottom: 10 }}>
          Appen kraschade
        </Text>
        <Text style={{ fontSize: 14, color: '#222', marginBottom: 12 }}>
          {message}
        </Text>
        {meta ? (
          <Text style={{ fontSize: 12, color: '#444', marginBottom: 12 }}>
            {typeof meta === 'string' ? meta : JSON.stringify(meta)}
          </Text>
        ) : null}
        {stack ? (
          <Text style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
            {stack}
          </Text>
        ) : null}

        <TouchableOpacity
          style={{ backgroundColor: '#1976D2', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignSelf: 'flex-start' }}
          onPress={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined' && window?.location?.reload) {
              window.location.reload();
            } else {
              // For native, the safest is just to clear the error boundary state.
              this.setState({ error: null, info: null, meta: null });
            }
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Ladda om</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
