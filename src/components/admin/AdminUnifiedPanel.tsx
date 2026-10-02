import React, { useState, useEffect } from 'react';
import { ShieldCheck, Activity, Download, Key } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

// 1. Dashboard Stats Component
export const AdminDashboardStats: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [expandedCard, setExpandedCard] = useState<'users' | 'testers' | null>(null);

  const loadStats = async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    try {
      const { data } = await supabase?.rpc('admin_get_dashboard_stats', {
        p_admin_email: user.email,
      }) || { data: null };
      if (data?.success) {
        setStats(data.stats);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadStats();
    
    // Configurar actualización en tiempo real simple mediante polling cada 30 segundos
    // para reflejar "a medida que otros usuarios se registren"
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Activity className="h-5 w-5 text-ice-light" />
        Telemetría y Estado General
      </h2>
      
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div 
            className={`bg-surface-2 rounded-xl p-4 border transition-all cursor-pointer ${expandedCard === 'users' ? 'border-ice-primary shadow-elevation-2 col-span-2 md:col-span-3' : 'border-white/[0.08] hover:border-white/[0.2]'}`}
            onClick={() => setExpandedCard(expandedCard === 'users' ? null : 'users')}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-neutral-400">Usuarios Totales (Haz click)</div>
                <div className="text-2xl font-bold mt-1">{stats.total_users}</div>
              </div>
            </div>
            
            {expandedCard === 'users' && stats.users_list && (
              <div className="mt-4 pt-4 border-t border-white/[0.08] max-h-60 overflow-y-auto pr-2">
                <table className="w-full text-left text-xs text-neutral-300">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="pb-2 font-medium">Email</th>
                      <th className="pb-2 font-medium">Rol</th>
                      <th className="pb-2 font-medium text-right">Registro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {stats.users_list.map((u: any, i: number) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-2">{u.email}</td>
                        <td className="py-2">
                          <span className="bg-surface-3 px-2 py-0.5 rounded text-[10px]">{u.role}</span>
                        </td>
                        <td className="py-2 text-right">{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div 
            className={`bg-surface-2 rounded-xl p-4 border transition-all cursor-pointer ${expandedCard === 'testers' ? 'border-ice-light shadow-elevation-2 col-span-2 md:col-span-3' : 'border-white/[0.08] hover:border-white/[0.2]'}`}
            onClick={() => setExpandedCard(expandedCard === 'testers' ? null : 'testers')}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-neutral-400">Testers Activos (Haz click)</div>
                <div className="text-2xl font-bold mt-1 text-ice-light">{stats.active_testers}</div>
              </div>
            </div>
            
            {expandedCard === 'testers' && stats.testers_list && (
              <div className="mt-4 pt-4 border-t border-white/[0.08] max-h-60 overflow-y-auto pr-2">
                <table className="w-full text-left text-xs text-neutral-300">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="pb-2 font-medium">Email del Tester</th>
                      <th className="pb-2 font-medium text-right">Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {stats.testers_list.map((t: any, i: number) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-2 text-ice-light">{t.email}</td>
                        <td className="py-2 text-right text-neutral-400">{new Date(t.expires_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className={`bg-surface-2 rounded-xl p-4 border border-white/[0.08] ${expandedCard ? 'hidden md:block' : ''}`}>
            <div className="text-xs text-neutral-400">Códigos Activos</div>
            <div className="text-2xl font-bold mt-1 text-studio-mint">{stats.active_codes}</div>
          </div>
          <div className={`bg-surface-2 rounded-xl p-4 border border-white/[0.08] ${expandedCard ? 'hidden md:block' : ''}`}>
            <div className="text-xs text-neutral-400">Códigos Pendientes</div>
            <div className="text-2xl font-bold mt-1 text-coach-rose">{stats.pending_codes}</div>
          </div>
          <div className={`bg-surface-2 rounded-xl p-4 border border-white/[0.08] ${expandedCard ? 'hidden md:block' : ''}`}>
            <div className="text-xs text-neutral-400">Sesiones (24h)</div>
            <div className="text-2xl font-bold mt-1 text-blue-400">{stats.recent_sessions}</div>
          </div>
          <div className={`bg-surface-2 rounded-xl p-4 border border-white/[0.08] ${expandedCard ? 'hidden md:block' : ''}`}>
            <div className="text-xs text-neutral-400">Errores (24h)</div>
            <div className="text-2xl font-bold mt-1 text-danger">{stats.recent_errors}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-neutral-400">Cargando estadísticas...</div>
      )}
      <div className="mt-8 bg-surface-2 rounded-xl p-4 border border-white/[0.08]">
         <h3 className="text-sm font-bold text-white mb-2">Arquitectura de Telemetría</h3>
         <p className="text-xs text-neutral-400 mb-2">
           La telemetría ahora está desacoplada de la base de datos principal para evitar la sobrecarga con eventos de alta frecuencia.
           Se implementa un buffer temporal local que envía lotes a la tabla `telemetry_events`, los cuales pueden ser consolidados periódicamente a Google Drive.
         </p>
      </div>
    </div>
  );
};

// 2. Code Generator Component
export const AdminCodeGenerator: React.FC = () => {
  const [durationDays, setDurationDays] = useState<number>(30);
  const [customDays, setCustomDays] = useState<number>(30);
  const [assignedEmail, setAssignedEmail] = useState('');
  const [accessType, setAccessType] = useState('TESTER');
  const [generatedCode, setGeneratedCode] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    setIsGenerating(true);
    setMessage('');
    try {
      const finalDays = durationDays === -1 ? customDays : durationDays;
      const { data, error } = await supabase?.rpc('admin_generate_access_code', {
        p_admin_email: user.email,
        p_duration_days: finalDays,
        p_assigned_email: assignedEmail.trim() || null,
        p_type: accessType
      }) || { data: null, error: new Error('Supabase no inicializado') };
      
      if (error || !data?.success) {
        setMessage(data?.error || error?.message || 'Error al generar código');
      } else {
        setGeneratedCode(data.code);
        setMessage('Código generado exitosamente.');
      }
    } catch (e: any) {
      setMessage(e.message);
    }
    setIsGenerating(false);
  };

  return (
    <div className="animate-fade-in max-w-xl">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
        <Key className="h-5 w-5 text-coach-rose" />
        Generador de Códigos de Acceso
      </h2>
      <form onSubmit={handleGenerateCode} className="space-y-4 bg-surface-2 p-5 rounded-xl border border-white/[0.08]">
        
        <div>
          <label className="text-xs font-medium text-neutral-300 mb-1 block">Tipo de Acceso</label>
          <select 
            value={accessType} 
            onChange={(e) => setAccessType(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-surface-3 py-2 px-3 text-sm text-white focus:border-ice-primary focus:outline-none"
          >
            <option value="TESTER">Tester</option>
            <option value="PREMIUM">Premium</option>
            <option value="COACH">Entrenador</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-neutral-300 mb-1 block">Duración</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {[1, 3, 7, 15, 30, 45, 60, 90].map(days => (
              <button
                type="button"
                key={days}
                onClick={() => setDurationDays(days)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${durationDays === days ? 'bg-ice-primary/20 border-ice-primary text-ice-light' : 'border-white/[0.1] text-neutral-400 hover:bg-white/[0.05]'}`}
              >
                {days} días
              </button>
            ))}
            <button
                type="button"
                onClick={() => setDurationDays(-1)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${durationDays === -1 ? 'bg-ice-primary/20 border-ice-primary text-ice-light' : 'border-white/[0.1] text-neutral-400 hover:bg-white/[0.05]'}`}
              >
                Personalizado
            </button>
          </div>
          {durationDays === -1 && (
            <input
              type="number"
              min={1}
              value={customDays}
              onChange={(e) => setCustomDays(parseInt(e.target.value) || 1)}
              className="w-full rounded-xl border border-white/[0.08] bg-surface-3 py-2 px-3 text-sm text-white focus:border-ice-primary focus:outline-none"
              placeholder="Cantidad de días"
            />
          )}
        </div>

        <Field
          id="assign-email"
          type="email"
          label="Email Asociado (Opcional)"
          value={assignedEmail}
          onChange={(e) => setAssignedEmail(e.target.value)}
          placeholder="usuario@ejemplo.com"
        />

        <Button type="submit" variant="primary" className="w-full mt-2" disabled={isGenerating}>
          {isGenerating ? 'Generando...' : 'GENERAR CÓDIGO'}
        </Button>
        
        {message && !generatedCode && (
          <div className="p-3 bg-danger/20 border border-danger/50 text-danger text-sm rounded-lg">
            {message}
          </div>
        )}
      </form>

      {generatedCode && (
        <div className="mt-6 p-5 bg-surface-2 border border-studio-mint/40 rounded-xl space-y-3 animate-fade-in">
          <div className="flex items-center gap-2 text-studio-mint font-bold text-sm">
            <ShieldCheck className="h-4 w-4" />
            Código Generado y Registrado Exitosamente
          </div>
          <div className="text-2xl font-mono text-white tracking-widest bg-black/40 p-3 rounded-lg text-center border border-white/[0.05] select-all">
            {generatedCode.code}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-neutral-300 mt-2">
            <div><strong>Duración:</strong> {generatedCode.duration_days} días</div>
            <div><strong>Tipo:</strong> {generatedCode.type}</div>
            <div><strong>Estado:</strong> {generatedCode.status}</div>
            <div><strong>Email:</strong> {generatedCode.assigned_email || 'Ninguno'}</div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full border border-white/[0.1] mt-2"
            onClick={() => {
              navigator.clipboard.writeText(generatedCode.code);
              alert('Código copiado al portapapeles');
            }}
          >
            Copiar al Portapapeles
          </Button>
        </div>
      )}
    </div>
  );
};

// 3. Reports Component
export const AdminReports: React.FC = () => {
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // Cargar Google Identity Services
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
    
    // Recuperar token y config de autoguardado
    const savedToken = localStorage.getItem('google_drive_token');
    const autoSync = localStorage.getItem('google_drive_autosync');
    if (savedToken) {
      setGoogleToken(savedToken);
      setIsGoogleConnected(true);
    }
    if (autoSync === 'true') {
      setAutoSyncEnabled(true);
    }

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleConnectGoogle = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setSyncMessage('Error: Falta VITE_GOOGLE_CLIENT_ID en el archivo .env');
      return;
    }
    
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response: any) => {
          if (response.error) {
            setSyncMessage('Error al conectar: ' + response.error);
            return;
          }
          setGoogleToken(response.access_token);
          setIsGoogleConnected(true);
          localStorage.setItem('google_drive_token', response.access_token);
          setSyncMessage('Google Drive conectado exitosamente.');
        },
      });
      client.requestAccessToken();
    } catch (err: any) {
      setSyncMessage('Fallo al inicializar Google Auth. ¿Está cargado el script?');
    }
  };

  const uploadToDrive = async (filename: string, csvContent: string) => {
    if (!googleToken) return false;
    
    const fileMetadata = {
      name: filename,
      mimeType: 'text/csv'
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
    form.append('file', new Blob([csvContent], { type: 'text/csv' }));

    try {
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleToken}`
        },
        body: form
      });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const generateAndUploadTelemetry = async () => {
    if (!isGoogleConnected) return;
    setIsSyncing(true);
    setSyncMessage('Obteniendo datos de telemetría...');
    
    try {
      // Obtener sesiones recientes (ejemplo de telemetría)
      const res = await supabase?.from('telemetry_sessions').select('*').limit(100);
      const sessions = res?.data;
      
      let csv = 'session_id,user_id,device,os,login_at\n';
      if (sessions) {
        sessions.forEach((s: any) => {
          csv += `${s.session_id},${s.user_id},${s.device_type},${s.operating_system},${s.login_at}\n`;
        });
      }
      
      setSyncMessage('Subiendo archivo a Drive...');
      const dateStr = new Date().toISOString().split('T')[0];
      const success = await uploadToDrive(`telemetry_export_${dateStr}.csv`, csv);
      
      if (success) {
        setSyncMessage('¡Datos sincronizados a Google Drive con éxito!');
      } else {
        setSyncMessage('Error al subir. El token pudo haber expirado.');
        setIsGoogleConnected(false);
        localStorage.removeItem('google_drive_token');
      }
    } catch (err: any) {
      setSyncMessage('Error en la sincronización: ' + err.message);
    }
    
    setIsSyncing(false);
  };
  
  // Ejecutar auto-sync al montar si está habilitado y conectado
  useEffect(() => {
    if (isGoogleConnected && autoSyncEnabled) {
      // Simula el proceso automático
      generateAndUploadTelemetry();
      
      // Auto-sync cada 1 hora
      const interval = setInterval(generateAndUploadTelemetry, 3600000);
      return () => clearInterval(interval);
    }
  }, [isGoogleConnected, autoSyncEnabled]);

  const toggleAutoSync = () => {
    const newVal = !autoSyncEnabled;
    setAutoSyncEnabled(newVal);
    localStorage.setItem('google_drive_autosync', newVal ? 'true' : 'false');
  };

  return (
    <div className="animate-fade-in space-y-6">
       <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
        <Download className="h-5 w-5 text-blue-400" />
        Reportes & Google Drive
      </h2>
      <div className="bg-surface-2 rounded-xl p-5 border border-white/[0.08]">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
           <span className={`w-2 h-2 rounded-full ${isGoogleConnected ? 'bg-studio-mint' : 'bg-coach-rose'}`}></span>
           Estado: {isGoogleConnected ? 'Conectado a Google Drive' : 'No Conectado'}
        </h3>
        <p className="text-xs text-neutral-400 mb-4">
          Conecta tu cuenta de Google Drive para subir y respaldar automáticamente los datos de telemetría (usuarios, códigos, sesiones y errores) en formato CSV.
        </p>
        
        {!isGoogleConnected ? (
          <Button variant="primary" className="border border-white/[0.1] bg-blue-600 hover:bg-blue-500 text-white" onClick={handleConnectGoogle}>
            Conectar Cuenta de Google Drive
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
             <div className="flex flex-wrap gap-3">
               <Button variant="primary" className="border border-white/[0.1]" onClick={generateAndUploadTelemetry} disabled={isSyncing}>
                 {isSyncing ? 'Subiendo...' : 'Sincronizar Telemetría Ahora'}
               </Button>
               <Button 
                  variant="ghost" 
                  className={`border ${autoSyncEnabled ? 'border-studio-mint text-studio-mint' : 'border-white/[0.1]'}`}
                  onClick={toggleAutoSync}
               >
                 {autoSyncEnabled ? 'Autoguardado Activado' : 'Activar Autoguardado'}
               </Button>
               <Button variant="ghost" className="border border-danger/30 text-danger hover:bg-danger/10" onClick={() => {
                 setIsGoogleConnected(false);
                 setGoogleToken(null);
                 localStorage.removeItem('google_drive_token');
                 setSyncMessage('Desconectado.');
               }}>
                 Desconectar
               </Button>
             </div>
          </div>
        )}
        
        {syncMessage && (
          <div className="mt-4 p-3 bg-black/40 border border-white/[0.1] rounded-lg text-xs font-mono text-neutral-300">
            &gt; {syncMessage}
          </div>
        )}
      </div>
      
      <div className="bg-black/30 rounded-xl p-4 border border-white/[0.05]">
        <div className="text-xs text-neutral-500 font-mono">
          [STORAGE] drive/skatecore_reports/Users/<br/>
          [STORAGE] drive/skatecore_reports/Access Codes/<br/>
          [STORAGE] drive/skatecore_reports/Sessions/<br/>
          [STORAGE] drive/skatecore_reports/Errors/
        </div>
      </div>
    </div>
  );
};
