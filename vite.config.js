import { defineConfig } from 'vite';
export default defineConfig({ build: { lib: { entry: 'native-voice-entry.js', name: 'RCNativeVoiceBridge', formats: ['iife'], fileName: () => 'native-voice.js' }, outDir: 'dist', emptyOutDir: true, sourcemap: false, minify: 'esbuild' } });
