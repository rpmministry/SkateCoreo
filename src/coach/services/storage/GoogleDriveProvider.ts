/**
 * GoogleDriveProvider.ts — Integración oficial con Google Drive REST API v3
 *
 * Utiliza OAuth 2.0 con alcance mínimo por archivo:
 * Scope: 'https://www.googleapis.com/auth/drive.file'
 *
 * Privacidad estricta: sólo accede a los archivos y carpetas creados por SkateCoreo.
 * Nunca solicita ni almacena contraseñas de Google.
 */

import { StorageProvider, StorageUploadResult } from './StorageProvider';
import { CloudProviderId, StorageItem } from '../../types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export class GoogleDriveProvider implements StorageProvider {
  readonly id: CloudProviderId = 'google_drive';
  readonly name = 'Google Drive';
  readonly iconName = 'Cloud';

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private userEmail: string | null = null;
  private userName: string | null = null;
  private rootFolderId: string | null = null;
  private clientId: string = '';

  constructor(clientId?: string) {
    if (clientId) this.clientId = clientId;
    this.loadCachedSession();
  }

  private loadCachedSession(): void {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const raw = sessionStorage.getItem('skatecoreo_gdrive_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.token && parsed.expiresAt > Date.now()) {
          this.accessToken = parsed.token;
          this.tokenExpiresAt = parsed.expiresAt;
          this.userEmail = parsed.email || null;
          this.userName = parsed.name || null;
          this.rootFolderId = parsed.rootFolderId || null;
          this.clientId = parsed.clientId || this.clientId;
        }
      }
    } catch {}
  }

  private saveSession(): void {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      sessionStorage.setItem(
        'skatecoreo_gdrive_session',
        JSON.stringify({
          token: this.accessToken,
          expiresAt: this.tokenExpiresAt,
          email: this.userEmail,
          name: this.userName,
          rootFolderId: this.rootFolderId,
          clientId: this.clientId,
        })
      );
    } catch {}
  }

  public setConfig(clientId: string, token?: string, expiresInSeconds: number = 3600): void {
    this.clientId = clientId;
    if (token) {
      this.accessToken = token;
      this.tokenExpiresAt = Date.now() + expiresInSeconds * 1000;
      this.saveSession();
    }
  }

  isConnected(): boolean {
    return Boolean(this.accessToken && this.tokenExpiresAt > Date.now());
  }

  async connect(): Promise<boolean> {
    // Si ya tiene token válido
    if (this.isConnected()) return true;

    // 1. Si no hay Client ID configurado, permite que el usuario ingrese un token o su Client ID
    if (!this.clientId) {
      const customToken = window.prompt(
        'Conexión Google Drive:\nIntroduce tu Token OAuth de Google Drive (o configura tu Client ID en Ajustes de Almacenamiento):'
      );
      if (customToken && customToken.trim()) {
        this.accessToken = customToken.trim();
        this.tokenExpiresAt = Date.now() + 3600 * 1000;
        await this.getUserInfo();
        this.saveSession();
        return true;
      }
      return false;
    }

    // 2. Google Identity Services (GIS) oficial en el navegador
    return new Promise((resolve) => {
      try {
        const win = window as any;
        if (!win.google || !win.google.accounts || !win.google.accounts.oauth2) {
          // Inyectar script oficial de Google si no está presente
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.defer = true;
          script.onload = () => {
            this.initGisTokenClient(resolve);
          };
          script.onerror = () => {
            alert('No se pudo cargar la librería oficial de Google Identity Services.');
            resolve(false);
          };
          document.head.appendChild(script);
        } else {
          this.initGisTokenClient(resolve);
        }
      } catch (err) {
        console.error('Error al inicializar Google OAuth:', err);
        resolve(false);
      }
    });
  }

  private initGisTokenClient(callback: (success: boolean) => void): void {
    try {
      const win = window as any;
      const client = win.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: async (response: any) => {
          if (response.error) {
            console.error('Error de autorización Google:', response.error);
            callback(false);
            return;
          }
          this.accessToken = response.access_token;
          const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
          this.tokenExpiresAt = Date.now() + expiresIn * 1000;
          await this.getUserInfo();
          this.saveSession();
          callback(true);
        },
      });
      client.requestAccessToken();
    } catch (e) {
      console.error('Excepción en GIS Token Client:', e);
      callback(false);
    }
  }

  async disconnect(): Promise<void> {
    if (this.accessToken && typeof window !== 'undefined') {
      try {
        const win = window as any;
        if (win.google?.accounts?.oauth2?.revoke) {
          win.google.accounts.oauth2.revoke(this.accessToken, () => {});
        }
      } catch {}
    }
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.userEmail = null;
    this.userName = null;
    this.rootFolderId = null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('skatecoreo_gdrive_session');
    }
  }

  async getUserInfo(): Promise<{ email?: string; name?: string } | null> {
    if (!this.accessToken) return null;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        this.userEmail = data.email || null;
        this.userName = data.name || null;
        return { email: this.userEmail || undefined, name: this.userName || undefined };
      }
    } catch {}
    return { email: this.userEmail || undefined, name: this.userName || undefined };
  }

  /**
   * Crea una carpeta en Google Drive o retorna la existente.
   */
  async createFolder(folderName: string, parentFolderId?: string): Promise<string> {
    if (!this.isConnected()) throw new Error('Google Drive no está conectado.');

    const parent = parentFolderId || 'root';
    const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false and '${parent}' in parents`;
    const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
      }
    }

    // Crear la carpeta
    const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parent],
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Error al crear carpeta en Google Drive: ${errText}`);
    }

    const created = await createRes.json();
    return created.id;
  }

  /**
   * Sube un archivo con metadata mediante Multipart Upload oficial de Google Drive.
   */
  async uploadFile(
    fileName: string,
    content: Blob | string,
    mimeType: string = 'application/octet-stream',
    parentFolderId?: string
  ): Promise<StorageUploadResult> {
    if (!this.isConnected()) throw new Error('Google Drive no está conectado.');

    const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
    const metadata = {
      name: fileName,
      parents: parentFolderId ? [parentFolderId] : undefined,
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      metadata
    )}`;
    const mediaPartHeader = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

    const metaBlob = new Blob([metadataPart], { type: 'text/plain' });
    const headerBlob = new Blob([mediaPartHeader], { type: 'text/plain' });
    const closeBlob = new Blob([closeDelimiter], { type: 'text/plain' });

    const multipartBlob = new Blob([metaBlob, headerBlob, blob, closeBlob], {
      type: `multipart/related; boundary=${boundary}`,
    });

    const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,size,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBlob,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error al subir archivo a Google Drive: ${errText}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      size: data.size ? parseInt(data.size, 10) : blob.size,
      webViewLink: data.webViewLink,
    };
  }

  async downloadFile(fileId: string): Promise<Blob> {
    if (!this.isConnected()) throw new Error('Google Drive no está conectado.');

    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Error al descargar archivo ${fileId} de Google Drive`);
    }

    return await res.blob();
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.isConnected()) throw new Error('Google Drive no está conectado.');

    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`Error al eliminar archivo ${fileId} en Google Drive`);
    }
  }

  async listFiles(parentFolderId?: string): Promise<StorageItem[]> {
    if (!this.isConnected()) return [];

    const parent = parentFolderId || 'root';
    const query = `'${parent}' in parents and trashed = false`;
    const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(
      query
    )}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=100`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      path: f.name,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      size: f.size ? parseInt(f.size, 10) : undefined,
      updatedAt: f.modifiedTime ? new Date(f.modifiedTime).getTime() : undefined,
      mimeType: f.mimeType,
    }));
  }

  getOpenLocationUrl(fileOrFolderId?: string): string | null {
    if (!fileOrFolderId) return 'https://drive.google.com/drive/my-drive';
    return `https://drive.google.com/drive/folders/${fileOrFolderId}`;
  }
}
