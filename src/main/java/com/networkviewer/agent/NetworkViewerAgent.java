package com.networkviewer.agent;

import com.networkviewer.model.SystemInfo;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Run on each machine you want to appear in Network Viewer: responds to multicast discovery and
 * serves {@code GET /system} (JSON) on {@link SystemInfo.NetworkInfo#DEFAULT_HTTP_PORT}.
 */
public final class NetworkViewerAgent {

    private NetworkViewerAgent() {}

    public static void main(String[] args) throws IOException {
        int httpPort = SystemInfo.NetworkInfo.DEFAULT_HTTP_PORT;
        for (int i = 0; i < args.length; i++) {
            if ("--http-port".equals(args[i]) && i + 1 < args.length) {
                httpPort = Integer.parseInt(args[++i]);
            }
        }

        SystemInfo snapshot = SystemInfo.currentMachine(httpPort);
        String json = snapshot.toJson().toString();

        ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();
        startMulticastResponder(json, pool);
        startHttpServer(httpPort, json, pool);

        System.out.println("Network Viewer agent listening:");
        System.out.println("  Multicast " + SystemInfo.NetworkInfo.MULTICAST_HOST + ":"
                + SystemInfo.NetworkInfo.MULTICAST_PORT);
        System.out.println("  HTTP http://<this-host>:" + httpPort + "/system");
        System.out.println("  Hostname: " + snapshot.hostname());

        try {
            new CountDownLatch(1).await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void startMulticastResponder(String json, ExecutorService pool)
            throws IOException {
        String groupHost = SystemInfo.NetworkInfo.MULTICAST_HOST;
        int port = SystemInfo.NetworkInfo.MULTICAST_PORT;
        InetAddress group = InetAddress.getByName(groupHost);

        MulticastSocket socket = new MulticastSocket(port);
        socket.setReuseAddress(true);

        boolean joined = false;
        for (NetworkInterface nic :
                NetworkInterface.networkInterfaces()
                        .filter(
                                n -> {
                                    try {
                                        return n.isUp();
                                    } catch (SocketException e) {
                                        return false;
                                    }
                                })
                        .toList()) {
            if (nic.isLoopback()) {
                continue;
            }
            try {
                socket.joinGroup(new InetSocketAddress(group, port), nic);
                joined = true;
            } catch (Exception ignored) {
                // next
            }
        }
        if (!joined) {
            socket.joinGroup(group);
        }

        pool.submit(
                () -> {
                    byte[] buf = new byte[8192];
                    while (!Thread.currentThread().isInterrupted()) {
                        try {
                            DatagramPacket in = new DatagramPacket(buf, buf.length);
                            socket.receive(in);
                            String msg =
                                    new String(in.getData(), in.getOffset(), in.getLength(), StandardCharsets.UTF_8);
                            if (!msg.startsWith("REQ:SystemInfo:v1")) {
                                continue;
                            }
                            String payload = "RSP:SystemInfo:v1\n" + json;
                            byte[] outBytes = payload.getBytes(StandardCharsets.UTF_8);
                            DatagramPacket out =
                                    new DatagramPacket(
                                            outBytes,
                                            outBytes.length,
                                            in.getAddress(),
                                            in.getPort());
                            socket.send(out);
                        } catch (IOException e) {
                            if (!socket.isClosed()) {
                                e.printStackTrace();
                            }
                            break;
                        }
                    }
                    return null;
                });
    }

    private static void startHttpServer(int httpPort, String json, ExecutorService pool)
            throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(httpPort), 0);
        server.setExecutor(pool);
        server.createContext(
                "/system",
                (HttpExchange ex) -> {
                    if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
                        ex.sendResponseHeaders(405, -1);
                        ex.close();
                        return;
                    }
                    byte[] body = json.getBytes(StandardCharsets.UTF_8);
                    ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
                    ex.sendResponseHeaders(200, body.length);
                    try (OutputStream os = ex.getResponseBody()) {
                        os.write(body);
                    }
                });
        server.start();
    }
}
