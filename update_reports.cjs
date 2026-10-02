const fs = require('fs');
let content = fs.readFileSync('src/components/admin/AdminUnifiedPanel.tsx', 'utf8');

const replacement = `// 3. Reports Component
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
          'Authorization': \`Bearer \${googleToken}\`
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
      const { data: sessions } = await supabase.from('telemetry_sessions').select('*').limit(100);
      
      let csv = 'session_id,user_id,device,os,login_at\\n';
      if (sessions) {
        sessions.forEach(s => {
          csv += \`\${s.session_id},\${s.user_id},\${s.device_type},\${s.operating_system},\${s.login_at}\\n\`;
        });
      }
      
      setSyncMessage('Subiendo archivo a Drive...');
      const dateStr = new Date().toISOString().split('T')[0];
      const success = await uploadToDrive(\`telemetry_export_\${dateStr}.csv\`, csv);
      
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
           <span className={\`w-2 h-2 rounded-full \${isGoogleConnected ? 'bg-studio-mint' : 'bg-coach-rose'}\`}></span>
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
                  className={\`border \${autoSyncEnabled ? 'border-studio-mint text-studio-mint' : 'border-white/[0.1]'}\`}
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
};`;

const oldStart = '// 3. Reports Component';
const oldEnd = '};'; // End of file

const idx1 = content.indexOf(oldStart);
const idx2 = content.lastIndexOf(oldEnd);

if (idx1 !== -1 && idx2 !== -1) {
    const newContent = content.substring(0, idx1) + replacement + '\n';
    fs.writeFileSync('src/components/admin/AdminUnifiedPanel.tsx', newContent, 'utf8');
} else {
    console.log("Could not replace AdminReports");
}
