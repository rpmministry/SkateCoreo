import { CloudProviderId, StorageItem } from '../../types';

export interface StorageUploadResult {
  id: string;
  name: string;
  size?: number;
  webViewLink?: string;
}

export interface StorageProvider {
  readonly id: CloudProviderId;
  readonly name: string;
  readonly iconName: string;

  /**
   * Indica si el proveedor tiene una sesión OAuth activa y válida.
   */
  isConnected(): boolean;

  /**
   * Inicia el flujo OAuth oficial con permisos mínimos.
   */
  connect(): Promise<boolean>;

  /**
   * Cierra la sesión del proveedor y elimina tokens en memoria/almacenamiento.
   */
  disconnect(): Promise<void>;

  /**
   * Obtiene la identidad de la cuenta conectada.
   */
  getUserInfo(): Promise<{ email?: string; name?: string } | null>;

  /**
   * Crea una carpeta en la nube si no existe y retorna su ID.
   */
  createFolder(folderName: string, parentFolderId?: string): Promise<string>;

  /**
   * Sube un archivo a una carpeta específica.
   */
  uploadFile(
    fileName: string,
    content: Blob | string,
    mimeType?: string,
    parentFolderId?: string
  ): Promise<StorageUploadResult>;

  /**
   * Descarga el contenido binario de un archivo.
   */
  downloadFile(fileId: string): Promise<Blob>;

  /**
   * Elimina un archivo o carpeta en la nube.
   */
  deleteFile(fileId: string): Promise<void>;

  /**
   * Lista los archivos y carpetas dentro de un contenedor.
   */
  listFiles(parentFolderId?: string): Promise<StorageItem[]>;

  /**
   * Obtiene la URL oficial del proveedor para abrir la carpeta o archivo en la interfaz web oficial.
   */
  getOpenLocationUrl(fileOrFolderId?: string): string | null;
}
