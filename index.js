
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import 'react-native-reanimated';

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

import App from './App';

registerRootComponent(App);

