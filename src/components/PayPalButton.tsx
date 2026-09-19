/**
 * PayPalButton.tsx — Componente Oficial de Botón de Pago PayPal Business
 *
 * Renderiza los botones de PayPal usando el SDK oficial en modo 'capture',
 * delega la verificación al backend y actualiza el acceso anual del usuario.
 */

import React, { useEffect, useRef, useState } from 'react';
import { paypalService } from '../services/paypalService';

interface PayPalButtonProps {
  amount?: string; // '20.00'
  onSuccess: (message: string) => void;
  onError: (errorMsg: string) => void;
}

export const PayPalButton: React.FC<PayPalButtonProps> = ({
  amount = '20.00',
  onSuccess,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingSdk, setIsLoadingSdk] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
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
            height: 46,
          },

          createOrder: (_data: any, actions: any) => {
            return actions.order.create({
              purchase_units: [
                {
                  description: 'SkateArt Pro - Suscripción Anual (1 Año / 365 días)',
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
              const result = await paypalService.captureOrder(data.orderID);

              if (result.success) {
                onSuccess(result.message || '¡Pago completado con éxito! 1 año de acceso otorgado.');
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
            onError('Transacción cancelada por el usuario en PayPal.');
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
        onError('No se pudo cargar el SDK de PayPal. Revisa tu conexión.');
      };
      document.body.appendChild(script);
    } else {
      if ((window as any).paypal) {
        renderButtons();
      } else {
        script.onload = () => renderButtons();
      }
    }
  }, [amount, onSuccess, onError]);

  return (
    <div className="w-full space-y-2">
      {isLoadingSdk && (
        <div className="w-full h-12 rounded-xl bg-slate-800/80 border border-white/5 animate-pulse flex items-center justify-center text-xs text-slate-400 font-medium">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan animate-ping" />
            Cargando pasarela segura PayPal Business...
          </span>
        </div>
      )}

      {isProcessing && (
        <div className="w-full p-3 rounded-xl bg-cyan/10 border border-cyan/30 text-cyan text-xs text-center font-bold animate-pulse">
          Validando y acreditando tu año de acceso en el servidor seguro...
        </div>
      )}

      <div 
        ref={containerRef} 
        className={isLoadingSdk ? 'hidden' : 'w-full'} 
      />
    </div>
  );
};

