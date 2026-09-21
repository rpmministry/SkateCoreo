import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Activity, 
  Music, 
  MapPin, 
  Users, 
  Download, 
  AlertTriangle,
  Smartphone,
  Globe
} from 'lucide-react';
import { dbService } from '../services/db';
import { SkateCoreoBrand } from './brand/SkateCoreoBrand';

interface NavbarProps {
  activeTab: 'panel' | 'rink' | 'audio' | 'skaters';
  setActiveTab: (tab: 'panel' | 'rink' | 'audio' | 'skaters') => void;
  isBluetoothWarning: boolean;
  bluetoothMessage: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isBluetoothWarning,
  bluetoothMessage
}) => {
  const { t, i18n } = useTranslation();
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIosModal, setShowIosModal] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Automatically ensure storage persistence under the hood
    dbService.requestPersistentStorage().catch(() => {});

    // Check iOS user agent
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIos(isIosDevice);

    // PWA Install prompt listener
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      });
    } else if (isIos) {
      setShowIosModal(true);
    }
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('es') ? 'en' : 'es';
    i18n.changeLanguage(nextLang);
  };

  return (
    <>
      <header className="bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 sticky top-0 z-40 px-3 py-2 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo & Brand Identity (Responsive) */}
          <SkateCoreoBrand />

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800/80">
            <button
              onClick={() => setActiveTab('rink')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.96] touch-target ${
                activeTab === 'rink'
                  ? 'bg-teal-400 text-zinc-950 shadow-md shadow-teal-400/25 border border-teal-300 font-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span className="hidden md:inline">{t('nav.choreography', 'Pista 2D')}</span>
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.96] touch-target ${
                activeTab === 'audio'
                  ? 'bg-teal-400 text-zinc-950 shadow-md shadow-teal-400/25 border border-teal-300 font-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <Music className="w-4 h-4" />
              <span className="hidden md:inline">{t('nav.audio_multitrack', 'Audio Multitrack')}</span>
            </button>

            <button
              onClick={() => setActiveTab('panel')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.96] touch-target ${
                activeTab === 'panel'
                  ? 'bg-teal-400 text-zinc-950 shadow-md shadow-teal-400/25 border border-teal-300 font-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span className="hidden md:inline">{t('nav.technical_panel', 'Panel Técnico')}</span>
            </button>

            <button
              onClick={() => setActiveTab('skaters')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.96] touch-target ${
                activeTab === 'skaters'
                  ? 'bg-teal-400 text-zinc-950 shadow-md shadow-teal-400/25 border border-teal-300 font-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="hidden md:inline">{t('nav.skaters', 'Patinadoras')}</span>
            </button>
          </nav>

          {/* Quick Actions (Language Switcher, PWA Install, Alerts) */}
          <div className="flex items-center gap-2">
            
            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 text-xs font-mono font-bold border border-zinc-800 transition-all active:scale-[0.96]"
              title="Cambiar idioma (Español / English)"
            >
              <Globe className="w-3.5 h-3.5 text-teal-400" />
              <span>{i18n.language.toUpperCase().slice(0, 2)}</span>
            </button>

            {/* Install PWA Button */}
            {(installPrompt || isIos) && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-bold transition-all active:scale-[0.96]"
              >
                <Download className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden sm:inline">Instalar PWA</span>
              </button>
            )}
          </div>
        </div>

        {/* Non-blocking Bluetooth latency warning banner */}
        {isBluetoothWarning && (
          <div className="mt-2 py-1.5 px-3 rounded-lg bg-amber-950/90 border border-amber-600/60 text-amber-200 text-xs flex items-center gap-2 max-w-7xl mx-auto shadow-md">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
            <p className="flex-1 text-[11px] sm:text-xs">
              {bluetoothMessage || t('audio.bluetooth_warning', 'Latencia de audio inalámbrico detectada (~1s).')}
            </p>
          </div>
        )}
      </header>

      {/* iOS Installation Modal */}
      {showIosModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-skate-panel border border-skate-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sky-500/20 rounded-xl text-sky-400">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Instalar en iPhone o iPad</h3>
                <p className="text-xs text-zinc-400">Acceso offline y modo pantalla completa</p>
              </div>
            </div>

            <ol className="text-xs text-zinc-300 space-y-2.5 list-decimal pl-5">
              <li>Toca el botón <strong className="text-teal-400">Compartir</strong> en la barra inferior de Safari.</li>
              <li>Desplázate hacia abajo y selecciona <strong className="text-teal-400">Agregar a pantalla de inicio</strong>.</li>
              <li>Toca <strong className="text-teal-400">Agregar</strong> en la esquina superior derecha.</li>
            </ol>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowIosModal(false)}
                className="px-4 py-2 bg-teal-400 hover:bg-teal-300 text-zinc-950 font-black text-xs rounded-xl transition-all active:scale-[0.96]"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
