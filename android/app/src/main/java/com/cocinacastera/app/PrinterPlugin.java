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