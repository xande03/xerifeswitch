import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Xerife Music — shell nativo (iOS/Android).
 *
 * `server.url` apontava para o preview da Lovable
 * (https://e2889fd9-...lovableproject.com). Aquele projeto foi despublicado:
 * o dominio hoje responde HTTP 404 "Project not found", ou seja, o WebView
 * nativo abria uma pagina de erro em vez do app. Sem `server.url` o Capacitor
 * serve os assets locais de `webDir` (dist) via localhost -- o app passa a ser
 * auto-contido e funciona offline para o que nao e rede, e deixa de depender de
 * um host de preview que muda a cada publicacao.
 *
 * Para usar um host remoto de novo (p.ex. staging), readicione server.url -- mas
 * aponte para algo seu e estavel, nunca para o dominio de preview da Lovable.
 */
const config: CapacitorConfig = {
  appId: 'app.lovable.e2889fd95f9c458c8a0d757d82c16808',
  appName: 'xerifemusic',
  webDir: 'dist',
  server: {
    // cleartext mantido: o proxy de audio e alguns posters do YouTube ainda
    // resolvem por http em alguns aparelhos (ver SOLUCAO_PROXY_AUDIO.md).
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
