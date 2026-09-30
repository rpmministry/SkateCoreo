/**
 * OneDriveProvider.ts — Integración oficial con Microsoft OneDrive vía Microsoft Graph API v1.0
 *
 * Utiliza OAuth 2.0 y Microsoft Graph API.
 * Alcance mínimo: 'Files.ReadWrite'
 *
 * Organiza los datos en la carpeta /SkateCoreo.
 * Nunca solicita ni almacena contraseñas de Microsoft.
 */

import { StorageProvider, StorageUploadResult } from './StorageProvider';
import { CloudProviderId, StorageItem } from '../../types';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

export class OneDriveProvider implements StorageProvider {
  readonly id: CloudProviderId = 'onedrive';
  readonly name = 'Microsoft OneDrive';
  readonly iconName = 'Cloud';

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private userEmail: string | null = null;
  private userName: string | null = null;
  private clientId: string = '';

  constructor(clientId?: string) {
    this.clientId = clientId || (import.meta.env?.VITE_ONEDRIVE_CLIENT_ID as string) || '';
    this.loadCachedSession();
  }

  private loadCachedSession(): void {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const raw = sessionStorage.getItem('skatecoreo_onedrive_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.token && parsed.expiresAt > Date.now()) {
          this.accessToken = parsed.token;
          this.tokenExpiresAt = parsed.expiresAt;
          this.userEmail = parsed.email || null;
          this.userName = parsed.name || null;
          this.clientId = parsed.clientId || this.clientId;
        }
      }
    } catch {}
  }

  private saveSession(): void {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      sessionStorage.setItem(
        'skatecoreo_onedrive_session',
        JSON.stringify({
          token: this.accessToken,
          expiresAt: this.tokenExpiresAt,
          email: this.userEmail,
          name: this.userName,
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
    if (this.isConnected()) return true;

    if (!this.clientId) {
      this.clientId = (import.meta.env?.VITE_ONEDRIVE_CLIENT_ID as string) || '';
    }

    if (!this.clientId) {
      console.warn('OneDrive: VITE_ONEDRIVE_CLIENT_ID no configurado en variables de entorno.');
      alert('Para conectar con Microsoft OneDrive con un clic, configura VITE_ONEDRIVE_CLIENT_ID en las variables de entorno.');
      return false;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const scope = encodeURIComponent('Files.ReadWrite User.Read offline_access');
    const authUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=' +
      encodeURIComponent(this.clientId) +
      '&response_type=token&redirect_uri=' +
      encodeURIComponent(redirectUri) +
      '&scope=' + scope + '&prompt=select_account';

    return new Promise((resolve) => {
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        authUrl,
        'skatecoreo_onedrive_oauth',
        'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',status=0,toolbar=0,location=0'
      );

      if (!popup) {
        alert('Por favor habilita las ventanas emergentes (popups) en tu navegador para continuar.');
        resolve(false);
        return;
      }

      const timer = setInterval(async () => {
        try {
          if (popup.closed) {
            clearInterval(timer);
            resolve(this.isConnected());
            return;
          }
          if (popup.location && popup.location.origin === window.location.origin) {
            const hash = popup.location.hash || '';
            const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
            const token = params.get('access_token');
            const expiresIn = params.get('expires_in');
            if (token) {
              clearInterval(timer);
              popup.close();
              this.accessToken = token;
              const expSec = expiresIn ? parseInt(expiresIn, 10) : 3600;
              this.tokenExpiresAt = Date.now() + expSec * 1000;
              await this.getUserInfo();
              this.saveSession();
              resolve(true);
            }
          }
        } catch {}
      }, 500);
    });
  }

  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.userEmail = null;
    this.userName = null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('skatecoreo_onedrive_session');
    }
  }

  async getUserInfo(): Promise<{ email?: string; name?: string } | null> {
    if (!this.accessToken) return null;
    try {
      const res = await fetch(`${GRAPH_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        this.userEmail = data.userPrincipalName || data.mail || null;
        this.userName = data.displayName || null;
        return { email: this.userEmail || undefined, name: this.userName || undefined };
      }
    } catch {}
    return { email: this.userEmail || undefined, name: this.userName || undefined };
  }

  async createFolder(folderName: string, parentFolderId?: string): Promise<string> {
    if (!this.isConnected()) throw new Error('OneDrive no está conectado.');

    const parentPath = parentFolderId
      ? `${GRAPH_API_BASE}/me/drive/items/${parentFolderId}/children`
      : `${GRAPH_API_BASE}/me/drive/root/children`;

    // Buscar si ya existe
    const listRes = await fetch(parentPath, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const existing = (listData.value || []).find(
        (item: any) => item.name.toLowerCase() === folderName.toLowerCase() && item.folder
      );
      if (existing) return existing.id;
    }

    // Crear carpeta
    const res = await fetch(parentPath, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error al crear carpeta en OneDrive: ${errText}`);
    }

    const created = await res.json();
    return created.id;
  }

  async uploadFile(
    fileName: string,
    content: Blob | string,
    mimeType: string = 'application/octet-stream',
    parentFolderId?: string
  ): Promise<StorageUploadResult> {
    if (!this.isConnected()) throw new Error('OneDrive no está conectado.');

    const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
    const parentPath = parentFolderId
      ? `${GRAPH_API_BASE}/me/drive/items/${parentFolderId}:/${encodeURIComponent(fileName)}:/content`
      : `${GRAPH_API_BASE}/me/drive/root:/SkateCoreo/${encodeURIComponent(fileName)}:/content`;

    const res = await fetch(parentPath, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': mimeType,
      },
      body: blob,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error al subir archivo a OneDrive: ${errText}`);
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      size: data.size,
      webViewLink: data.webUrl,
    };
  }

  async downloadFile(fileId: string): Promise<Blob> {
    if (!this.isConnected()) throw new Error('OneDrive no está conectado.');

    const res = await fetch(`${GRAPH_API_BASE}/me/drive/items/${fileId}/content`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Error al descargar archivo ${fileId} de OneDrive`);
    }

    return await res.blob();
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.isConnected()) throw new Error('OneDrive no está conectado.');

    const res = await fetch(`${GRAPH_API_BASE}/me/drive/items/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`Error al eliminar archivo ${fileId} en OneDrive`);
    }
  }

  async listFiles(parentFolderId?: string): Promise<StorageItem[]> {
    if (!this.isConnected()) return [];

    const parentPath = parentFolderId
      ? `${GRAPH_API_BASE}/me/drive/items/${parentFolderId}/children`
      : `${GRAPH_API_BASE}/me/drive/root/children`;

    const res = await fetch(parentPath, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.value || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      path: item.webUrl || item.name,
      isFolder: Boolean(item.folder),
      size: item.size,
      updatedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime).getTime() : undefined,
    }));
  }

  getOpenLocationUrl(fileOrFolderId?: string): string | null {
    if (!fileOrFolderId) return 'https://onedrive.live.com';
    return `https://onedrive.live.com/?id=${encodeURIComponent(fileOrFolderId)}`;
  }
}
