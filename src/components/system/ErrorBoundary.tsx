import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Modo compacto: muestra un aviso en línea en vez de pantalla completa. */
  inline?: boolean;
  /** Mensaje opcional para el modo inline. */
  inlineMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

/**
 * ErrorBoundary de la aplicación. Evita que un fallo de render (p. ej. durante el
 * procesado de una foto en móvil) desmonte la app entera y pierda el estado.
 * Muestra una pantalla de recuperación con reintento y recarga.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: unknown): void {
    // Diagnóstico en consola; no se propaga para no tumbar la app.
    // eslint-disable-next-line no-console
    console.error('[SkateCoreo] Error de interfaz:', error, info);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, message: undefined });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    if (this.props.inline) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-coral/40 bg-coral/10 p-4 text-center">
          <p className="text-xs font-bold text-coral">
            {this.props.inlineMessage || 'No se pudo mostrar este panel.'}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-200"
          >
            Reintentar
          </button>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-5 bg-neon-canvas px-safe pb-safe pt-safe text-center text-white">
        <div className="max-w-md space-y-2 px-6">
          <h1 className="text-lg font-black tracking-wide">Algo salió mal</h1>
          <p className="text-sm leading-relaxed text-slate-400">
            La aplicación encontró un error inesperado. Tu proyecto sigue guardado.
          </p>
          {this.state.message && (
            <p className="break-words rounded-lg bg-white/5 px-3 py-2 text-[11px] text-slate-500">
              {this.state.message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-2xl border border-cyan/40 bg-cyan/15 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-cyan"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-slate-300"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
