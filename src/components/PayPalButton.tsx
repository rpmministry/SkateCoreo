/**
 * PayPalButton.tsx — Componente Oficial de Botón de Pago PayPal Business
 *
 * Exige el correo del comprador antes de activar el pago, vinculando el recibo
 * con 'custom_id' en PayPal para evitar pagos huérfanos y permitir registro condicionado.
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
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=capture&components=buttons`;
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
      <div className="w-full p-4 rounded-2xl bg-slate-900/60 border border-dashed border-white/15 text-center space-y-1.5 transition-all">
        <div className="flex items-center justify-center gap-1.5 text-xs text-amber-400 font-semibold">
          <Mail className="w-4 h-4" />
          <span>Ingresa tu correo arriba</span>
        </div>
        <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
          El botón de pago oficial de PayPal se habilitará automáticamente al ingresar un correo válido para asociar tu licencia.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {isLoadingSdk && (
        <div className="w-full h-12 rounded-xl bg-slate-800/80 border border-white/5 animate-pulse flex items-center justify-center text-xs text-slate-400 font-medium">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan animate-ping" />
            Cargando pasarela de pago segura...
          </span>
        </div>
      )}

      {isProcessing && (
        <div className="w-full p-3 rounded-xl bg-cyan/15 border border-cyan/30 text-cyan text-xs text-center font-bold animate-pulse flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan shrink-0" />
          <span>Confirmando pago y generando recibo seguro...</span>
        </div>
      )}

      <div 
        ref={containerRef} 
        className={isLoadingSdk ? 'hidden' : 'w-full'} 
      />
    </div>
  );
};
