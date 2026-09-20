import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

/**
 * ErrorBoundary da RAIZ (2026-09-20): sem ele, qualquer crash de render
 * deixava a tela em branco (relato do preview Lovable: "Should have a
 * queue. This is likely a bug in React" → blank screen). Com ele, o usuário
 * vê uma tela de recuperação em pt-BR com botão de recarregar — e o erro
 * segue logado no console para diagnóstico.
 *
 * Obs.: invariantes internos do React (fila de hooks corrompida por HMR no
 * dev) não são recuperáveis em árvore — para esses, o main.tsx recarrega a
 * página automaticamente (1x por sessão); este boundary cobre o resto.
 */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Xerife] Erro de render captado:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40 }}>🤠</div>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Opa, o Xerife tropeçou</h1>
        <p style={{ fontSize: 13, opacity: 0.7, maxWidth: 340, margin: 0, lineHeight: 1.5 }}>
          Ocorreu um erro inesperado na interface. Recarregar resolve na grande maioria dos casos —
          sua biblioteca, favoritos e histórico continuam salvos no aparelho.
        </p>
        {this.state.message && (
          <code
            style={{
              fontSize: 10.5,
              opacity: 0.45,
              maxWidth: 420,
              padding: "6px 10px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 8,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {this.state.message}
          </code>
        )}
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: "10px 22px",
            borderRadius: 999,
            border: "none",
            background: "#ef4444",
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Recarregar o app
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
