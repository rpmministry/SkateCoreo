/**
 * PayPalButton.tsx — Componente Oficial de Botón de Pago PayPal Business
 *
 * Exige el correo del comprador antes de activar el pago, vinculando el recibo
 * con 'custom_id' en PayPal para evitar pagos huérfanos y permitir registro condicionado.
 *
 * Presentación: el contenedor (`paypal-safe`) se limita al ancho disponible de
 * la tarjeta para evitar desbordes en móvil. El SDK se configura en español de
 * Ecuador (`es_EC`) por defecto, verificable/ajustable con `VITE_PAYPAL_LOCALE`;
 * si el valor no tiene el formato soportado (`xx_XX`) se omite el parámetro
 * `locale` para que PayPal lo autodetecte y nunca falle la carga del SDK. No se
 * modifica el flujo de pago, ni `createOrder`/`captureOrder`, ni el servicio
 * PayPal.
 */

import React, { useEffect, useRef, useState } from 'react';
import { paypalService, PayPalCaptureResult } from '../services/paypalService';
import { Mail, ShieldCheck } from 'lucide-react';

interface PayPalSuccessData {
  orderID: string;
  payerEmail: string;
  payerName?: string;
  message?: string;
}

interface PayPalButtonProps {
  amount?: string; // '20.00'
  buyerEmail: string;
  onSuccess: (data: PayPalSuccessData) => void;
  onError: (errorMsg: string) => void;
}

export const PayPalButton: React.FC<PayPalButtonProps> = ({
  amount = '20.00',
  buyerEmail,
  onSuccess,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingSdk, setIsLoadingSdk] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const isEmailValid = Boolean(
    buyerEmail &&
    buyerEmail.trim().length > 4 &&
    buyerEmail.includes('@') &&
    buyerEmail.includes('.')
  );

  useEffect(() => {
    if (!isEmailValid) return;

    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || 'sb';
    const currency = 'USD';
    // Español de Ecuador (soportado por el SDK). Un valor sin el formato
    // `xx_XX` se descarta en lugar de enviarse: PayPal responde 400 a locales
    // inválidos y el script no cargaría, rompiendo el pago. Si no hay locale
    // válido se omite el parámetro y PayPal autodetecta el idioma.
    const requestedLocale = import.meta.env.VITE_PAYPAL_LOCALE || 'es_EC';
    const locale = /^[a-z]{2}_[A-Z]{2}$/.test(requestedLocale) ? requestedLocale : '';
    const localeParam = locale ? `&locale=${locale}` : '';
    const scriptId = 'paypal-sdk-official';

    const renderButtons = () => {
      const paypal = (window as any).paypal;
      if (!paypal || !containerRef.current) return;

      containerRef.current.innerHTML = '';

      try {
        paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'pay',
            height: 48,
            // Sin tagline: reduce el ancho/alto intrínseco y evita desborde.
            tagline: false,
          },

          createOrder: (_data: any, actions: any) => {
            const cleanEmail = buyerEmail.trim().toLowerCase();
            return actions.order.create({
              purchase_units: [
                {
                  custom_id: cleanEmail,
                  description: 'SkateCoreo Pro - Licencia Anual 2026 (1 Año / 365 días)',
                  amount: {
                    currency_code: currency,
                    value: amount,
                  },
                },
              ],
            });
          },

          onApprove: async (data: any) => {
            setIsProcessing(true);
            try {
              const result: PayPalCaptureResult = await paypalService.captureOrder(data.orderID);

              if (result.success) {
                onSuccess({
                  orderID: data.orderID,
                  payerEmail: result.payer_email || buyerEmail.trim().toLowerCase(),
                  payerName: result.payer_name || '',
                  message: result.message,
                });
              } else {
                onError(result.error || 'No se pudo verificar el pago en el servidor.');
              }
            } catch (err: any) {
              onError(err?.message || 'Error inesperado durante la verificación del pago.');
            } finally {
              setIsProcessing(false);
            }
          },

          onCancel: () => {
            onError('Transacción cancelada en PayPal. Puedes intentar de nuevo cuando gustes.');
          },

          onError: (err: any) => {
            console.error('Error reportado por PayPal SDK:', err);
            onError('Ocurrió un inconveniente con la pasarela de PayPal. Intenta de nuevo.');
          },
        }).render(containerRef.current);

        setIsLoadingSdk(false);
      } catch (e: any) {
        console.error('Error al renderizar botones de PayPal:', e);
        setIsLoadingSdk(false);
      }
    };

    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=capture&components=buttons${localeParam}`;
      script.async = true;
      script.onload = () => renderButtons();
      script.onerror = () => {
        setIsLoadingSdk(false);
        onError('No se pudo conectar con los servidores de PayPal.');
      };
      document.body.appendChild(script);
    } else {
      if ((window as any).paypal) {
        renderButtons();
      } else {
        script.onload = () => renderButtons();
      }
    }
  }, [buyerEmail, isEmailValid, amount, onSuccess, onError]);

  if (!isEmailValid) {
    return (
      <div className="paypal-safe w-full rounded-2xl border border-dashed border-white/15 bg-slate-900/60 p-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-400">
          <Mail className="h-4 w-4" />
          <span>Ingresa tu correo arriba</span>
        </div>
        <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-snug text-slate-400">
          El botón de pago oficial de PayPal se habilitará automáticamente al ingresar un
          correo válido para asociar tu licencia.
        </p>
      </div>
    );
  }

  return (
    <div className="paypal-safe w-full space-y-2">
      {isLoadingSdk && (
        <div className="flex h-12 w-full items-center justify-center rounded-xl border border-white/5 bg-slate-800/80 text-xs font-medium text-slate-400 animate-pulse">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan animate-ping" />
            Cargando pasarela de pago segura...
          </span>
        </div>
      )}

      {isProcessing && (
        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan/30 bg-cyan/15 p-3 text-xs font-bold text-cyan animate-pulse">
          <ShieldCheck className="h-4 w-4 shrink-0 text-cyan" />
          <span>Confirmando pago y generando recibo seguro...</span>
        </div>
      )}

      {/* El SDK inyecta aquí el botón; el contenedor lo mantiene dentro del ancho. */}
      <div ref={containerRef} className={isLoadingSdk ? 'hidden' : 'w-full'} />
    </div>
  );
};
