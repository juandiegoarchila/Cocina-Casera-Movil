package com.cocinacastera.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.io.IOException;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.ConnectException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "PrinterPlugin")
public class PrinterPlugin extends Plugin {
    
    private ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void testConnection(PluginCall call) {
        String ip = call.getString("ip");
        int port = call.getInt("port", 9100);
        
        if (ip == null || ip.isEmpty()) {
            call.reject("IP address is required");
            return;
        }

        executor.execute(() -> {
            try {
                Socket socket = new Socket();
                socket.connect(new java.net.InetSocketAddress(ip, port), 5000);
                socket.close();
                
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("message", "Conectado vía TCP nativo (como Loyverse)");
                call.resolve(result);
                
            } catch (ConnectException e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "No se pudo conectar a " + ip + ":" + port);
                call.resolve(result);
                
            } catch (SocketTimeoutException e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Timeout al conectar a " + ip + ":" + port);
                call.resolve(result);
                
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Error de conexión: " + e.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void printTCP(PluginCall call) {
        String ip = call.getString("ip");
        int port = call.getInt("port", 9100);
        String data = call.getString("data");
        
        if (ip == null || ip.isEmpty()) {
            call.reject("IP address is required");
            return;
        }
        
        if (data == null || data.isEmpty()) {
            call.reject("Print data is required");
            return;
        }

        executor.execute(() -> {
            try {
                Socket socket = new Socket();
                socket.connect(new java.net.InetSocketAddress(ip, port), 5000);
                
                OutputStream outputStream = socket.getOutputStream();
                outputStream.write(data.getBytes("UTF-8"));
                outputStream.flush();
                outputStream.close();
                socket.close();
                
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("message", "Impresión TCP nativa exitosa");
                call.resolve(result);
                
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Error de impresión: " + e.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void openCashDrawer(PluginCall call) {
        String ip = call.getString("ip");
        int port = call.getInt("port", 9100);
        
        if (ip == null || ip.isEmpty()) {
            call.reject("IP address is required");
            return;
        }

        executor.execute(() -> {
            try {
                Socket socket = new Socket();
                socket.connect(new java.net.InetSocketAddress(ip, port), 5000);
                
                OutputStream outputStream = socket.getOutputStream();
                // Comando ESC/POS para abrir cajón: ESC p 0 25 250
                byte[] openDrawerCommand = {0x1B, 0x70, 0x00, 0x19, (byte)0xFA};
                outputStream.write(openDrawerCommand);
                outputStream.flush();
                outputStream.close();
                socket.close();
                
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("message", "Caja abierta exitosamente");
                call.resolve(result);
                
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Error al abrir caja: " + e.getMessage());
                call.resolve(result);
            }
        });
    }

    @PluginMethod
    public void printWithImage(PluginCall call) {
        String ip = call.getString("ip");
        int port = call.getInt("port", 9100);
        String data = call.getString("data");
        String imageBase64 = call.getString("imageBase64");
        
        if (ip == null || ip.isEmpty()) {
            call.reject("IP address is required");
            return;
        }
        
        if (data == null || data.isEmpty()) {
            call.reject("Print data is required");
            return;
        }

        executor.execute(() -> {
            try {
                Socket socket = new Socket();
                socket.connect(new java.net.InetSocketAddress(ip, port), 5000);
                
                OutputStream outputStream = socket.getOutputStream();
                
                // Imprimir imagen primero si está disponible
                if (imageBase64 != null && !imageBase64.isEmpty()) {
                    try {
                        // Decodificar imagen base64
                        byte[] imageBytes = Base64.decode(imageBase64, Base64.DEFAULT);
                        Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
                        
                        if (bitmap != null) {
                            // Redimensionar imagen para impresora térmica (máximo 384 pixels de ancho)
                            int maxWidth = 384;
                            if (bitmap.getWidth() > maxWidth) {
                                int newHeight = (bitmap.getHeight() * maxWidth) / bitmap.getWidth();
                                bitmap = Bitmap.createScaledBitmap(bitmap, maxWidth, newHeight, false);
                            }
                            
                            // Convertir imagen a comandos ESC/POS
                            byte[] imageCommands = convertBitmapToEscPos(bitmap);
                            outputStream.write(imageCommands);
                        }
                    } catch (Exception e) {
                        // Si falla la imagen, continuar con el texto
                    }
                }
                
                // Imprimir texto
                outputStream.write(data.getBytes("UTF-8"));
                outputStream.flush();
                outputStream.close();
                socket.close();
                
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("message", "Impresión con imagen exitosa");
                call.resolve(result);
                
            } catch (Exception e) {
                JSObject result = new JSObject();
                result.put("success", false);
                result.put("error", "Error de impresión: " + e.getMessage());
                call.resolve(result);
            }
        });
    }

    // Función helper para convertir bitmap a comandos ESC/POS
    private byte[] convertBitmapToEscPos(Bitmap bitmap) {
        ByteArrayOutputStream stream = new ByteArrayOutputStream();
        
        try {
            // Centrar imagen
            stream.write(new byte[]{0x1B, 0x61, 0x01}); // ESC a 1 (centrar)
            
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            
            // Comandos para imagen bitmap
            stream.write(new byte[]{0x1D, 0x76, 0x30, 0x00}); // GS v 0
            
            // Calcular bytes por línea (debe ser múltiplo de 8)
            int bytesPerLine = (width + 7) / 8;
            
            // Escribir dimensiones
            stream.write(new byte[]{(byte)(bytesPerLine & 0xFF), (byte)((bytesPerLine >> 8) & 0xFF)});
            stream.write(new byte[]{(byte)(height & 0xFF), (byte)((height >> 8) & 0xFF)});
            
            // Convertir imagen a datos bitmap
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < bytesPerLine; x++) {
                    byte dataByte = 0;
                    for (int bit = 0; bit < 8; bit++) {
                        int pixelX = x * 8 + bit;
                        if (pixelX < width) {
                            int pixel = bitmap.getPixel(pixelX, y);
                            int gray = (int)(0.299 * ((pixel >> 16) & 0xFF) + 
                                           0.587 * ((pixel >> 8) & 0xFF) + 
                                           0.114 * (pixel & 0xFF));
                            if (gray < 128) { // Si es oscuro, imprimir
                                dataByte |= (1 << (7 - bit));
                            }
                        }
                    }
                    stream.write(dataByte);
                }
            }
            
            // Regresar a alineación izquierda
            stream.write(new byte[]{0x1B, 0x61, 0x00}); // ESC a 0
            stream.write(new byte[]{0x0A}); // Nueva línea
            
        } catch (Exception e) {
            // En caso de error, retornar array vacío
            return new byte[0];
        }
        
        return stream.toByteArray();
    }

    @PluginMethod
    public void autodetectPrinter(PluginCall call) {
        String baseIp = call.getString("baseIp", "192.168.1");
        int startRange = call.getInt("startRange", 100);
        int endRange = call.getInt("endRange", 110);
        int port = call.getInt("port", 9100);

        executor.execute(() -> {
            JSObject result = new JSObject();
            
            for (int i = startRange; i <= endRange; i++) {
                String ip = baseIp + "." + i;
                try {
                    Socket socket = new Socket();
                    socket.connect(new java.net.InetSocketAddress(ip, port), 2000);
                    socket.close();
                    
                    result.put("success", true);
                    result.put("ip", ip);
                    result.put("port", port);
                    result.put("message", "Impresora encontrada en " + ip + ":" + port);
                    call.resolve(result);
                    return;
                    
                } catch (Exception e) {
                    // Continuar buscando
                }
            }
            
            result.put("success", false);
            result.put("error", "No se encontró ninguna impresora en el rango " + baseIp + "." + startRange + "-" + endRange);
            call.resolve(result);
        });
    }
}