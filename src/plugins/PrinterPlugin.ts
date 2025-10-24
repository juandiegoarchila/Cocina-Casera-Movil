import { registerPlugin } from '@capacitor/core';

export interface PrinterPlugin {
  testConnection(options: { ip: string; port?: number }): Promise<{ success: boolean; message?: string; error?: string }>;
  printTCP(options: { ip: string; port?: number; data: string }): Promise<{ success: boolean; message?: string; error?: string }>;
  printWithImage(options: { ip: string; port?: number; data: string; imageBase64?: string }): Promise<{ success: boolean; message?: string; error?: string }>;
  openCashDrawer(options: { ip: string; port?: number }): Promise<{ success: boolean; message?: string; error?: string }>;
  autodetectPrinter(options?: { baseIp?: string; startRange?: number; endRange?: number; port?: number }): Promise<{ success: boolean; ip?: string; port?: number; message?: string; error?: string }>;
}

const PrinterPlugin = registerPlugin<PrinterPlugin>('PrinterPlugin');
export default PrinterPlugin;