/// <reference types="vite/client" />

/** Build version marker (git SHA + data) injetado pelo vite.config.ts em tempo de build.
 *  Visível em: console ("[Xerife] build ...") e document.documentElement.dataset.appBuild.
 *  Serve para diagnosticar cache/PWA desatualizado em produção. */
declare const __APP_BUILD__: string;
