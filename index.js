
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// Reanimated kan ge vit skärm på web vid start – ladda endast på native
if (Platform.OS !== 'web') {
  require('react-native-reanimated');
}

// Webb: sätt root-höjd direkt så att appen inte blir vit (innan React monteras)
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  try {
    const html = document.documentElement;
    if (html && html.style) {
      html.style.height = '100%';
      html.style.minHeight = '100vh';
    }
    if (document.body) {
      document.body.style.height = '100%';
      document.body.style.minHeight = '100vh';
      document.body.style.margin = '0';
    }
    const root = document.getElementById('root');
    if (root && root.style) {
      root.style.minHeight = '100vh';
      root.style.height = '100%';
    }
  } catch (_e) {}
}

import App from './App';

// Early suppression of noisy web-only warnings/errors so they don't flood the console
if (typeof Platform !== 'undefined' && Platform && Platform.OS === 'web') {
	try {
		const _origWarn = console.warn && console.warn.bind && console.warn.bind(console);
		console.warn = (...args) => {
			try {
				const msg = String(args && args[0] ? args[0] : '');
				if (msg.includes('props.pointerEvents is deprecated') || msg.includes('shadow*') || msg.includes('shadow* style props') || msg.includes('"shadow*"')) {
					return; // ignore these specific RN-web deprecation warnings
				}
			} catch (e) {}
			if (_origWarn) _origWarn(...args);
		};

		const _origError = console.error && console.error.bind && console.error.bind(console);
		console.error = (...args) => {
			try {
				const msg = String(args && args[0] ? args[0] : '');
				if (msg.includes('Fetch API cannot load') && msg.includes('firestore.googleapis.com') && msg.includes('due to access control checks')) {
					return; // ignore noisy Firestore webchannel access-control console errors
				}
			} catch (e) {}
			if (_origError) _origError(...args);
		};
	} catch (e) {}
}

registerRootComponent(App);

