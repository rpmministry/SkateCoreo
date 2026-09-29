/**
 * DropboxProvider.ts — Integración oficial con Dropbox API v2
 *
 * Utiliza OAuth 2.0 y Dropbox API v2.
 * Alcance mínimo: files.content.write, files.content.read
 *
 * Organiza los datos en /SkateCoreo.
 * Nunca solicita ni almacena contraseñas de Dropbox.
 */

import { StorageProvider, StorageUploadResult } from './StorageProvider';
import { CloudProviderId, StorageItem } from '../../types';

const DROPBOX_RPC_BASE = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_BASE = 'https://content.dropboxapi.com/2';

export class DropboxProvider implements StorageProvider {
  readonly id: CloudProviderId = 'dropbox';
  readonly name = 'Dropbox';
  readonly iconName = 'Cloud';

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private userEmail: string | null = null;
  private userName: string | null = null;
  private clientId: string = '';

  constructor(clientId?: string) {
    if (clientId) this.clientId = clientId;
    this.loadCachedSession();
  }

  private loadCachedSession(): void {
    try {
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const raw = sessionStorage.getItem('skatecoreo_dropbox_session');
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
        'skatecoreo_dropbox_session',
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

    const customToken = window.prompt(
      'Conexión Dropbox:\nIntroduce tu Token de acceso de Dropbox (o configúralo en Ajustes de Almacenamiento):'
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

  async disconnect(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.userEmail = null;
    this.userName = null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem('skatecoreo_dropbox_session');
    }
  }

  async getUserInfo(): Promise<{ email?: string; name?: string } | null> {
    if (!this.accessToken) return null;
    try {
      const res = await fetch(`${DROPBOX_RPC_BASE}/users/get_current_account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        this.userEmail = data.email || null;
        this.userName = data.name?.display_name || null;
        return { email: this.userEmail || undefined, name: this.userName || undefined };
      }
    } catch {}
    return { email: this.userEmail || undefined, name: this.userName || undefined };
  }

  async createFolder(folderName: string, parentFolderPath?: string): Promise<string> {
    if (!this.isConnected()) throw new Error('Dropbox no está conectado.');

    const cleanFolder = folderName.replace(/^\/+/, '').replace(/\/+$/, '');
    const cleanParent = (parentFolderPath || '/SkateCoreo').replace(/\/+$/, '');
    const fullPath = `${cleanParent}/${cleanFolder}`;

    try {
      const res = await fetch(`${DROPBOX_RPC_BASE}/files/create_folder_v2`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: fullPath,
          autorename: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return data.metadata.path_lower || fullPath;
      }
    } catch {}

    return fullPath;
  }

  async uploadFile(
    fileName: string,
    content: Blob | string,
    mimeType: string = 'application/octet-stream',
    parentFolderPath?: string
  ): Promise<StorageUploadResult> {
    if (!this.isConnected()) throw new Error('Dropbox no está conectado.');

    const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
    const cleanParent = (parentFolderPath || '/SkateCoreo').replace(/\/+$/, '');
    const fullPath = `${cleanParent}/${fileName}`;

    const res = await fetch(`${DROPBOX_CONTENT_BASE}/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: fullPath,
          mode: 'overwrite',
          autorename: true,
          mute: false,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: blob,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error al subir archivo a Dropbox: ${errText}`);
    }

    const data = await res.json();
    return {
      id: data.id || fullPath,
      name: data.name,
      size: data.size,
    };
  }

  async downloadFile(filePathOrId: string): Promise<Blob> {
    if (!this.isConnected()) throw new Error('Dropbox no está conectado.');

    const res = await fetch(`${DROPBOX_CONTENT_BASE}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: filePathOrId,
        }),
      },
    });

    if (!res.ok) {
      throw new Error(`Error al descargar archivo de Dropbox`);
    }

    return await res.blob();
  }

  async deleteFile(filePathOrId: string): Promise<void> {
    if (!this.isConnected()) throw new Error('Dropbox no está conectado.');

    await fetch(`${DROPBOX_RPC_BASE}/files/delete_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: filePathOrId }),
    });
  }

  async listFiles(folderPath?: string): Promise<StorageItem[]> {
    if (!this.isConnected()) return [];

    const path = folderPath || '/SkateCoreo';
    const res = await fetch(`${DROPBOX_RPC_BASE}/files/list_folder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: path === '/' ? '' : path,
        recursive: false,
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    return (data.entries || []).map((entry: any) => ({
      id: entry.id || entry.path_lower,
      name: entry.name,
      path: entry.path_display || entry.path_lower,
      isFolder: entry['.tag'] === 'folder',
      size: entry.size,
      updatedAt: entry.server_modified ? new Date(entry.server_modified).getTime() : undefined,
    }));
  }

  getOpenLocationUrl(folderPath?: string): string | null {
    if (!folderPath) return 'https://www.dropbox.com/home/SkateCoreo';
    return `https://www.dropbox.com/home${folderPath}`;
  }
}
