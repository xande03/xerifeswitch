import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.e2889fd95f9c458c8a0d757d82c16808',
  appName: 'xerifemusic',
  webDir: 'dist',
  server: {
    url: 'https://e2889fd9-5f9c-458c-8a0d-757d82c16808.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#121212',
  },
  android: {
    backgroundColor: '#121212',
  },
};

export default config;
